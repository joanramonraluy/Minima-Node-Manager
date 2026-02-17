import useSplash from './useSplash';
import Button from '../UI/Button';
import { useEffect } from 'react';

const Splash = () => {
  const { display, dismiss } = useSplash();

  useEffect(() => {
    document.body.classList.toggle('lock', display);
  }, [display]);

  if (!display) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 bg-black lg:core-black-contrast-1 z-50 w-screen h-screen flex flex-col p-8 pb-12">
      <div className="flex-grow flex items-center justify-center">
        <div className="lg:core-black-100 lg:p-12 lg:max-w-md text-center mb-12 lg:mb-6">
          <img alt="Status app icon" src="./icon.png" className="rounded w-[80px] h-[80px] mx-auto mb-8"/>
          <div className="text-3xl mb-6">Welcome to Health</div>
          <p className="mb-4">Designed to help you understand the status of your node.</p>
          <p>You can easily see the status of your node and learn how it's interacting with the network.</p>
          <div className="hidden lg:block mt-8">
            <Button variant="contrast-2" onClick={dismiss}>Continue</Button>
          </div>
        </div>
      </div>
      <div className="max-w-md w-full mx-auto lg:hidden">
        <Button variant="contrast-2" onClick={dismiss}>Continue</Button>
      </div>
    </div>
  );
};

export default Splash;
