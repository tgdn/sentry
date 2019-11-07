import React from 'react';
import DocumentTitle from 'react-document-title';
import PropTypes from 'prop-types';
import styled from 'react-emotion';
import * as ReactRouter from 'react-router';
import {Params} from 'react-router/lib/Router';
import {Location} from 'history';

import localStorage from 'app/utils/localStorage';
import {Organization} from 'app/types';
import {t} from 'app/locale';
import {trackAnalyticsEvent} from 'app/utils/analytics';
import SentryTypes from 'app/sentryTypes';
import GlobalSelectionHeader from 'app/components/organizations/globalSelectionHeader';
import {PageContent, PageHeader} from 'app/styles/organization';
import PageHeading from 'app/components/pageHeading';
import Banner from 'app/components/banner';
import Button from 'app/components/button';
import BetaTag from 'app/components/betaTag';
import Feature from 'app/components/acl/feature';
import SearchBar from 'app/views/events/searchBar';
import NoProjectMessage from 'app/components/noProjectMessage';
import theme from 'app/utils/theme';
import space from 'app/styles/space';
import withOrganization from 'app/utils/withOrganization';

import Events from './events';
import EventDetails from './eventDetails';
import SavedQueryButtonGroup from './savedQueryButtonGroup';
import QueryCard from './querycard';
import {getFirstQueryString} from './utils';
import {ALL_VIEWS, TRANSACTION_VIEWS} from './data';
import EventView from './eventView';
import MiniGraph from './miniGraph';

type Props = {
  organization: Organization;
  location: Location;
  router: ReactRouter.InjectedRouter;
  params: Params;
};

class EventsV2 extends React.Component<Props> {
  static propTypes: any = {
    organization: SentryTypes.Organization.isRequired,
    location: PropTypes.object.isRequired,
    router: PropTypes.object.isRequired,
  };

  state = {
    isBannerHidden: localStorage.getItem('discover-banner-dismissed'),
  };

  renderQueryList() {
    const {location, organization} = this.props;
    let views = ALL_VIEWS;
    if (organization.features.includes('transaction-events')) {
      views = [...ALL_VIEWS, ...TRANSACTION_VIEWS];
    }

    const list = views.map((eventViewv1, index) => {
      const eventView = EventView.fromEventViewv1(eventViewv1);
      const to = {
        pathname: location.pathname,
        query: {
          ...location.query,
          ...eventView.generateQueryStringObject(),
        },
      };

      return (
        <React.Fragment>
          <MiniGraph eventView={eventView} />
          <QueryCard
            key={index}
            to={to}
            title={eventView.name}
            queryDetail={eventView.query}
            onEventClick={() => {
              trackAnalyticsEvent({
                eventKey: 'discover_v2.prebuilt_query_click',
                eventName: 'Discoverv2: Click a pre-built query',
                organization_id: this.props.organization.id,
                query_name: eventView.name,
              });
            }}
          />
        </React.Fragment>
      );
    });

    return <QueryGrid>{list}</QueryGrid>;
  }

  getEventViewName = (): Array<string> => {
    const {location} = this.props;

    const name = getFirstQueryString(location.query, 'name');

    if (typeof name === 'string' && String(name).trim().length > 0) {
      return [t('Discover'), String(name).trim()];
    }

    return [t('Discover')];
  };

  handleClick = () => {
    localStorage.setItem('discover-banner-dismissed', true);
    this.setState({isBannerHidden: true});
  };

  renderBanner() {
    const bannerDismissed = localStorage.getItem('discover-banner-dismissed');

    if (bannerDismissed) {
      return null;
    } else {
      return (
        <StyledBanner
          title={t('Discover')}
          subtitle={t('Here are a few sample queries to kick things off')}
          onCloseClick={this.handleClick}
        >
          <BannerButton icon="icon-circle-add">
            {t('Users who error in < 1 min')}
          </BannerButton>
          <BannerButton icon="icon-circle-add">{t('Browsers by most bugs')}</BannerButton>
          <BannerButton icon="icon-circle-add">
            {t('Slowest HTTP endpoints')}
          </BannerButton>
        </StyledBanner>
      );
    }
  }

  renderNewQuery() {
    return (
      <div>
        {this.renderBanner()}
        <StyledSearchBar />
        {this.renderQueryList()}
      </div>
    );
  }

  render() {
    const {organization, location, router} = this.props;
    const eventSlug = getFirstQueryString(location.query, 'eventSlug');
    const eventView = EventView.fromLocation(location);

    const hasQuery = location.query.field || location.query.eventSlug;

    const documentTitle = this.getEventViewName()
      .reverse()
      .join(' - ');
    const pageTitle = this.getEventViewName().join(' \u2014 ');
    return (
      <Feature features={['events-v2']} organization={organization} renderDisabled>
        <DocumentTitle title={`${documentTitle} - ${organization.slug} - Sentry`}>
          <React.Fragment>
            <GlobalSelectionHeader organization={organization} />
            <PageContent>
              <NoProjectMessage organization={organization}>
                <PageHeader>
                  <PageHeading>
                    {pageTitle} <BetaTag />
                  </PageHeading>
                  {hasQuery && (
                    <SavedQueryButtonGroup
                      location={location}
                      organization={organization}
                      eventView={eventView}
                    />
                  )}
                </PageHeader>
                {!hasQuery && this.renderNewQuery()}
                {hasQuery && (
                  <Events
                    organization={organization}
                    location={location}
                    router={router}
                    eventView={eventView}
                  />
                )}
                {hasQuery && eventSlug && (
                  <EventDetails
                    organization={organization}
                    params={this.props.params}
                    eventSlug={eventSlug}
                    eventView={eventView}
                    location={location}
                  />
                )}
              </NoProjectMessage>
            </PageContent>
          </React.Fragment>
        </DocumentTitle>
      </Feature>
    );
  }
}

const BannerButton = styled(Button)`
  margin: ${space(1)} 0;

  @media (min-width: ${theme.breakpoints[1]}) {
    margin: 0 ${space(1)};
  }
`;

const StyledBanner = styled(Banner)`
  margin-bottom: ${space(3)};
`;

const StyledSearchBar = styled(SearchBar)`
  margin-bottom: ${space(3)};
`;

const QueryGrid = styled('div')`
  display: grid;
  grid-template-columns: minmax(100px, 1fr);
  grid-gap: ${space(3)};

  @media (min-width: ${theme.breakpoints[1]}) {
    grid-template-columns: repeat(2, minmax(100px, 1fr));
  }

  @media (min-width: ${theme.breakpoints[2]}) {
    grid-template-columns: repeat(3, minmax(100px, 1fr));
  }

  @media (min-width: ${theme.breakpoints[4]}) {
    grid-template-columns: repeat(5, minmax(100px, 1fr));
  }
`;

export default withOrganization(EventsV2);
export {EventsV2};
