import { useContext, useEffect, useState } from 'react';
import { appContext } from '../../../AppContext';
import { deleteFile, loadFile, saveFile } from '../../../lib';

function useSplash() {
  const { loaded } = useContext(appContext);
  const [display, setDisplay] = useState(false);

  useEffect(() => {
    if (loaded.current) {
      (async () => {
        const response = await loadFile('splash.json');

        if (!response) {
          setDisplay(true);
        }
      })();
    }
  }, [loaded]);

  useEffect(() => {
    if (loaded.current) {
      window['reset'] = () => deleteFile('splash.json');
    }
  }, [loaded]);

  const dismiss = async () => {
    await saveFile('splash.json', '1');
    setDisplay(false);
  };

  return {
    dismiss,
    display,
  };
}

export default useSplash;
