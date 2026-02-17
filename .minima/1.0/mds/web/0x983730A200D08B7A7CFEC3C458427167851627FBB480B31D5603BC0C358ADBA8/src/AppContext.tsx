import * as React from 'react';
import { createContext, Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { status, maxima, maxContacts, getBlock, network } from './lib';
import { BlockResponse, MaxContactsResponse, MaximaResponse, NetworkResponse, StatusResponse } from './types';
import isBefore from 'date-fns/isBefore';
import subMinutes from 'date-fns/subMinutes';
import useBadgeNotification from './hooks/useBadgeNotification';
import { isAfter } from 'date-fns';

export const appContext = createContext<{
  loaded: RefObject<boolean>;
  block: BlockResponse | null;
  maximaData: MaximaResponse | null;
  statusData: StatusResponse | null;
  networkData: NetworkResponse | null;
  maxContactData: MaxContactsResponse | null;
  maxContactStats: { ok: number; sameChain: number };
  badgeNotification: string | null;
  heavierChain: boolean,
  setBadgeNotification: Dispatch<SetStateAction<string | null>>;
}>({
  loaded: {
    current: false,
  },
  maximaData: null,
  block: null,
  statusData: null,
  networkData: null,
  maxContactData: null,
  maxContactStats: { ok: 0, sameChain: 0 },
  badgeNotification: '',
  heavierChain: false,
  setBadgeNotification: () => null,
});

const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const loaded = useRef(false);
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [maximaData, setMaximaData] = useState<MaximaResponse | null>(null);
  const [networkData, setNetworkData] = useState<NetworkResponse | null>(null);
  const [block, setBlock] = useState<BlockResponse | null>(null);
  const [maxContactData, setMaxContactData] = useState<MaxContactsResponse | null>(null);
  const [maxContactStats, setMaxContactState] = useState({ ok: 0, sameChain: 0 });
  const badgeNotification = useBadgeNotification();
  const [heavierChain, setHeavierChain] = useState(false);

  // init mds
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;

      (window as any).MDS.init((evt: any) => {
        if (evt.event === 'inited' || evt.event === 'NEWBLOCK') {
          status().then((statusResponse) => {
            setStatusData(statusResponse);
          });

          maxima().then((maximaResponse) => {
            maxContacts().then((maxContactsResponse) => {
              setMaximaData(maximaResponse);
              setMaxContactData(maxContactsResponse);
            });
          });
        }

        if (evt.event === 'inited') {
          getBlock().then((blockResponse) => {
            setBlock(blockResponse);
          });

          network().then((networkResponse) => {
            setNetworkData(networkResponse);
          });
        }

        if (evt.event === 'MDS_TIMER_60SECONDS') {
          network().then((networkResponse) => {
            setNetworkData(networkResponse);
          });
        }

        if (evt.event === 'NEWBLOCK') {
          setBlock({
            block: evt.data.txpow.header.block,
            timemilli: evt.data.txpow.header.timemilli,
            date: evt.data.txpow.header.date,
          });
        }

        if (evt.event === 'MDS_HEAVIER_CHAIN') {
          setHeavierChain(true);
        }
      });
    }
  }, [loaded]);

  useEffect(() => {
    if (maxContactData) {
      let networkOkCount = 0;
      let sameChainCount = 0;

      maxContactData.contacts.forEach((contact) => {
        const lastSeen = contact.lastseen;
        const sameChain = contact.samechain;

        const displayGreenNetwork = lastSeen ? isBefore(subMinutes(new Date(), 30), new Date(lastSeen)) : null;
        const displayRedNetwork = lastSeen ? isAfter(subMinutes(new Date(), 60), new Date(lastSeen)) : null;

        const displayGreenChain = sameChain && (displayGreenNetwork && sameChain);
        const displayYellowChain = sameChain && !!(displayRedNetwork && sameChain);

        if (displayGreenNetwork) {
          networkOkCount += 1;
        }

        if (displayGreenChain) {
          sameChainCount += 1;
        } else if (displayYellowChain) {
          sameChainCount += 1;
        }
      });

      setMaxContactState({
        ok: networkOkCount,
        sameChain: sameChainCount,
      });
    }
  }, [maxContactData]);

  const value = {
    loaded,
    block,
    maximaData,
    statusData,
    heavierChain,
    maxContactData,
    maxContactStats,
    networkData,
    ...badgeNotification,
  };

  return <appContext.Provider value={value}>{children}</appContext.Provider>;
};

export default AppProvider;
