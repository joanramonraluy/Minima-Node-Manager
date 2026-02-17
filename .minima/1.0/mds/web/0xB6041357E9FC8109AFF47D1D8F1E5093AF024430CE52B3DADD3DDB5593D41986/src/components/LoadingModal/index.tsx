import { FC } from "react";
import { useTransition, animated } from '@react-spring/web';
import { modalAnimation } from '../../animations';
import loadingSpinner from '../../spinner.json';
import Lottie from '@amelix/react-lottie';

type LoadingModalProps ={
  display: boolean;
  progress: number | null;
}

export const LoadingModal: FC<LoadingModalProps> = ({ display, progress }: LoadingModalProps) => {
  const transition: any = useTransition(display, modalAnimation as any);

  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: loadingSpinner,
  };

  return (
    <div>
      {transition((style, display) => (
        <div>
          {display && (
            <div className="absolute w-full h-full bg-black bg-opacity-30 left-0 top-0 z-50 flex items-center justify-center">
              <animated.div
                style={style}
                className="shadow-lg mx-4 w-full max-w-[320px] text-center lg:text-center font-bold bg-white rounded-lg box-shadow-md p-6 flex flex-col justify-center"
              >
                <div className="-mt-0.5 grid grid-cols-2 flex items-center w-full">
                  <div className="col-span-1 flex text-lg">
                    <h1>Uploading File</h1>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <div>
                      <Lottie options={defaultOptions} height={32} width={32} />
                    </div>
                  </div>
                </div>
                {/* As any because of issues with typing */}
                {progress && (
                  <div className="border-2 border-black h-[36px] mt-6 relative">
                    <div className="absolute blend z-10 left-[6px] top-[6px] font-black text-sm">{(Number(progress) * 100).toFixed(0)}%</div>
                    <div className="bg-black absolute w-full h-[36px] transition-all origin-left" style={{ transform: `scaleX(${progress})`, left: '-1px', top: '-2px', width: 'calc(100% + 1px)' }}></div>
                  </div>
                ) as any}
                <div onClick={() => window.location.reload()} className="cursor-pointer border-b w-fit mx-auto border-b-black pb-0.5 mt-6 mb-2">
                  Cancel
                </div>
              </animated.div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default LoadingModal;
