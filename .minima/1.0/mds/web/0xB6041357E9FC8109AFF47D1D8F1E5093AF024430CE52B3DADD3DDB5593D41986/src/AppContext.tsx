import * as React from 'react';
import { createContext, useEffect, useState } from "react";
import { clearDownload, deleteFromWeb, getDownloads, getStatus } from "./__minima__";
import { get, set } from "./lib";

export const appContext = createContext({} as any);

const AppProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [_notification, _setNotification] = useState<any>({
    display: false,
    message: '',
    callback: null,
  });
  const [root, setRoot] = useState('');
  const [pathname, setPathname] = useState<string | null>(null);
  const fullPath = root + (pathname ? `/mds/data/${pathname}/file` : '');
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      setLoaded(true);

      (window as any).MDS.init((msg: any) => {
        if (msg.event === 'inited') {
          get('SHOW_HIDDEN_FILES').then(function(response) {
            if (response.value === '1') {
              setShowHiddenItems(true);
            }
          });

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          MDS.sql('CREATE TABLE IF NOT EXISTS downloaded (id bigint auto_increment,file_path varchar(2048) NOT NULL)', function() {
            getDownloads().then(async (downloads: any) => {
              for (const file of downloads) {
                await deleteFromWeb(file.FILE_PATH + "_minima_download_as_file_");
                await clearDownload(file.FILE_PATH);
              }
            })
          });
        }
      });
    }
  }, [loaded]);

  useEffect(() => {
    getStatus().then((response: any) => {
      setRoot(response.data);
    })
  }, []);

  useEffect(() => {
      if (loaded) {
        set('SHOW_HIDDEN_FILES', showHiddenItems ? '1' : '0')
      }
  }, [showHiddenItems]);

  useEffect(() => {
    try {
      const path = window.location.pathname.split('/')
          .filter(i => i !== '')
          .filter(i => i.includes('0x'));

      if (path[0]) {
        setPathname(path[0] as string);
      }
    } catch {
      setPathname(null);
    }
  }, []);

  const promptNotification = (message: string, callback: unknown) => {
    _setNotification({ display: true, message, callback });
  };

  const dismissNotification = () => {
    _setNotification({ display: false, message: '', callback: null });
  };

  const value = {
    root,
    pathname,
    fullPath,
    _notification,
    loaded,
    setLoaded,
    promptNotification,
    dismissNotification,
    showHiddenItems,
    setShowHiddenItems,
  };

  return <appContext.Provider value={value}>{children}</appContext.Provider>;
};

export default AppProvider;
