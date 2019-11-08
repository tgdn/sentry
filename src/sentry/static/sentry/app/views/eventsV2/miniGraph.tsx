import React from 'react';

import withApi from 'app/utils/withApi';
import withGlobalSelection from 'app/utils/withGlobalSelection';
import {Client} from 'app/api';
import {GlobalSelection, Organization} from 'app/types';
import EventsRequest from 'app/views/events/utils/eventsRequest';
import AreaChart from 'app/components/charts/areaChart';

import EventView from './eventView';

type Props = {
  organization: Organization;
  eventView: EventView;
  api: Client;
  selection: GlobalSelection;
};

class MiniGraph extends React.Component<Props> {
  render() {
    const {organization, api, selection} = this.props;
    const {start, end, period} = selection.datetime;

    return (
      <EventsRequest
        organization={organization}
        api={api}
        start={start}
        end={end}
        period={period}
      >
        {({loading, timeseriesData}) => {
          if (loading) {
            return null;
          }

          const data = (timeseriesData || []).map(series => {
            return {
              ...series,
              areaStyle: {
                opacity: 0.4,
              },
              lineStyle: {
                opacity: 0,
              },
            };
          });

          return (
            <AreaChart
              height={100}
              series={[...data]}
              xAxis={{
                show: false,
                axisPointer: {
                  show: false,
                },
              }}
              yAxis={{
                show: false,
              }}
              tooltip={{
                show: false,
              }}
              toolBox={{
                show: false,
              }}
              grid={{
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                containLabel: false,
              }}
              colors={['#6d5fc7']}
              options={{
                hoverAnimation: false,
              }}
            />
          );
        }}
      </EventsRequest>
    );
  }
}

export default withApi(withGlobalSelection(MiniGraph));
