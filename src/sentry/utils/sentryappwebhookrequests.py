from __future__ import absolute_import

import six
import json

from dateutil.parser import parse as parse_date
from django.conf import settings
from django.utils import timezone

from sentry.utils import redis
from sentry.models.sentryapp import VALID_EVENTS


BUFFER_SIZE = 100
KEY_EXPIRY = 60 * 60 * 24 * 30  # 30 days


class SentryAppWebhookRequestsBuffer(object):
    """
    Create a data structure to store basic information about Sentry App webhook requests in Redis
    This should store the last 100 requests and last 100 errors (in different keys) for each event type, for each Sentry App
    """

    def __init__(self, sentry_app):
        self.sentry_app = sentry_app

        cluster_id = getattr(settings, "SENTRY_WEBHOOK_LOG_REDIS_CLUSTER", "default")
        self.client = redis.redis_clusters.get(cluster_id)

    def _get_redis_key(self, event, error=False):
        sentry_app_id = self.sentry_app.id

        if error:
            return "sentry-app-webhook-error:{{{0}}}:{1}".format(sentry_app_id, event)
        else:
            return "sentry-app-webhook-request:{{{0}}}:{1}".format(sentry_app_id, event)

    def _convert_redis_request(self, redis_request, event):
        """
        Convert the request string stored in Redis to a python dict
        Add the event type to the dict so that the request can be identified correctly
        """
        request = json.loads(redis_request)
        request["event_type"] = event

        return request

    def _add_to_buffer_pipeline(self, buffer_key, item, pipeline):
        """
        Add the item to the buffer key specified, using the given pipeline.
        This does not execute the pipeline's commands.
        """

        pipeline.lpush(buffer_key, json.dumps(item))
        pipeline.ltrim(buffer_key, 0, BUFFER_SIZE - 1)
        pipeline.expire(buffer_key, KEY_EXPIRY)

    def _get_all_from_buffer(self, buffer_key, pipeline=None):
        """
        Get the list at the buffer key, using the given pipeline if available.
        If a pipeline is provided, this does not return a value as the pipeline must still be executed.
        """

        if pipeline is not None:
            pipeline.lrange(buffer_key, 0, BUFFER_SIZE - 1)
        else:
            return self.client.lrange(buffer_key, 0, BUFFER_SIZE - 1)

    def _get_requests(self, event=None, error=False):
        # If no event is specified, return the latest requests/errors for all event types
        if event is None:
            pipe = self.client.pipeline()

            all_requests = []
            for evt in VALID_EVENTS:
                self._get_all_from_buffer(self._get_redis_key(evt, error=error), pipeline=pipe)

            values = pipe.execute()

            for idx, evt in enumerate(VALID_EVENTS):
                event_requests = [
                    self._convert_redis_request(request, evt) for request in values[idx]
                ]
                all_requests.extend(event_requests)

            all_requests.sort(key=lambda x: parse_date(x["date"]), reverse=True)
            return all_requests[0:BUFFER_SIZE]

        else:
            return [
                self._convert_redis_request(request, event)
                for request in self._get_all_from_buffer(self._get_redis_key(event, error=error))
            ]

    def get_errors(self, event=None):
        return self._get_requests(event=event, error=True)

    def get_requests(self, event=None):
        return self._get_requests(event=event, error=False)

    def add_request(self, response_code, org_id, event, url):
        if event not in VALID_EVENTS:
            return

        request_key = self._get_redis_key(event)

        time = timezone.now()
        request_data = {
            "date": six.text_type(time),
            "response_code": response_code,
            "webhook_url": url,
        }

        # Don't store the org id for internal apps because it will always be the org that owns the app anyway
        if not self.sentry_app.is_internal:
            request_data["organization_id"] = org_id

        pipe = self.client.pipeline()

        self._add_to_buffer_pipeline(request_key, request_data, pipe)

        # If it's an error add it to the error buffer
        if 400 <= response_code <= 599:
            error_key = self._get_redis_key(event, error=True)
            self._add_to_buffer_pipeline(error_key, request_data, pipe)

        pipe.execute()
