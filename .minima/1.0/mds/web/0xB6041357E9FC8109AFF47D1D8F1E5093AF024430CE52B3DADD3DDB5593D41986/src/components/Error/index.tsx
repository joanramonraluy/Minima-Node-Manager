import { useTransition, animated } from '@react-spring/web';
import { modalAnimation } from '../../animations';

export function ErrorModal({ display, dismiss }: any) {
  const transition: any = useTransition(display, modalAnimation as any);

  return (
    <div>
      {transition((style, display) => (
        <div>
          {display && (
            <div className="absolute w-full h-full bg-black bg-opacity-30 left-0 top-0 z-50 flex items-center justify-center">
              <animated.div
                style={style}
                className="shadow-lg mx-8 w-full max-w-xs text-center lg:text-center font-bold bg-white rounded-lg box-shadow-md p-7 flex flex-col justify-center"
              >
                <div className="-mt-2 bg-[url('./assets/alert-triangle.svg')] bg-cover bg-no-repeat mx-auto w-[30px] h-[30px] mb-4" />
                <div className="text-neutral-600">
                  There was an issue uploading this file, please try again later...
                </div>
                <button className="button mt-6 rounded" onClick={dismiss}>
                  Dismiss
                </button>
              </animated.div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ErrorModal;
