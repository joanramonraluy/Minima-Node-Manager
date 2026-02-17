import Clipboard from 'react-clipboard.js';
import { useContext, useEffect, useState } from "react";
import { useTransition, animated } from '@react-spring/web';
import { modalAnimation } from '../../animations';
import { appContext } from "../../AppContext";
import checkCircleSvg from '../../assets/check_circle.svg';

export function CopyPath({ display, data, close }: any) {
  const { fullPath } = useContext(appContext);
  const transition = useTransition(display, modalAnimation as any);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCopied(false);
    }, 2500);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

  return (
    <div>
      {transition((style, display) => (
        <div>
          {display && (
            <div className="restriction fixed w-screen h-screen flex justify-center items-center z-10">
              {display && (
                <div className="relative z-10 w-full">
                  <animated.div style={style} className="modal bg-white p-8 mx-auto">
                    <div className="text-left">
                      <h5 className="font-bold mb-5 mx-auto" style={{ fontSize: '22px' }}>
                        File path
                      </h5>
                      {data && (
                        <div className="background-grey p-3 mb-6 break-words">
                          {fullPath}{data.file.location}
                        </div>
                      )}
                      <div className="text-center">
                        {data && (
                          <Clipboard className="w-full" data-clipboard-text={`${fullPath}${data.file.location}`} onClick={() => setCopied(true)}>
                            <div className="relative button button--thick w-full">
                              {copied && 'Copied to clipboard'}
                              {!copied && 'Copy path'}
                              {copied && <img className="absolute right-4 top-4" src={checkCircleSvg} alt="Success" />}
                            </div>
                          </Clipboard>
                        )}
                        <div onClick={close} className="cursor-pointer mt-4 border-b w-fit mx-auto border-b-black pb-0.5">
                          Close
                        </div>
                      </div>
                    </div>
                  </animated.div>
                </div>
              )}
              <div className="fixed top-0 left-0 bg-black bg-opacity-30 absolute w-full h-full"></div>{' '}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default CopyPath;
