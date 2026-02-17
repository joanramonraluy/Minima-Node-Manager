import { useEffect, useState } from 'react';

function useSplash() {
  const [display, setDisplay] = useState(false);

  useEffect(() => {
    const item = localStorage.getItem('filez_splash');

    if (!item) {
      localStorage.setItem('filez_splash', '1');
      setDisplay(true);
    }
  }, []);

  useEffect(() => {
    (window as any).reset = () => localStorage.removeItem('filez_splash');
  }, []);

  return {
    display,
    setDisplay,
  };
}

export default useSplash;
