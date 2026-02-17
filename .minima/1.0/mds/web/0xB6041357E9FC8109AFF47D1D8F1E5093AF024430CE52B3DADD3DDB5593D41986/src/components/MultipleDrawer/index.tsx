import { useTransition, animated } from '@react-spring/web';
import { drawerAnimation } from '../../animations';
import { Dispatch, SetStateAction } from 'react';
import { MinimaFile } from '../../types';

type MultipleMenuProps = {
  data: string[] | false;
  display: boolean;
  setDisplayMove: Dispatch<SetStateAction<{ file: MinimaFile; path: string } | string[] | false>>;
  setDisplayDelete: Dispatch<SetStateAction<{ file: MinimaFile; path?: string } | string[] | false>>;
  close: () => void;
};

export function MultipleMenu({ data, setDisplayDelete, setDisplayMove, display, close }: MultipleMenuProps) {
  const transition: any = useTransition(display, drawerAnimation as any);

  const deleteItem = () => {
    close();
    setDisplayDelete(data);
  };

  const moveItem = () => {
    close();
    setDisplayMove(data);
  };

  const hasFolderSelected = data && data.filter((i: string) => !i.includes('.')).length > 0;

  return (
    <div>
      {transition((style, display) => (
        <div>
          {display && (
            <div className="restriction fixed w-screen h-screen flex justify-center items-center z-10">
              {display && (
                <div className="relative z-10 w-full">
                  <animated.div style={style} className="drawer restriction bg-white p-8 mx-auto">
                    <div className="text-center">
                      <div onClick={deleteItem} className="cursor-pointer grid grid-cols-12 mb-7">
                        <div className="col-span-1">
                          <svg
                            width="26"
                            height="29"
                            viewBox="0 0 26 29"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M4.79058 28.1663C4.07656 28.1663 3.46358 27.9103 2.95167 27.3984C2.43975 26.8865 2.18379 26.2735 2.18379 25.5595V3.39072H0.5V1.29677H7.75208V0.0253906H18.2478V1.29677H25.4999V3.39072H23.8161V25.5595C23.8161 26.2758 23.5607 26.8894 23.05 27.4001C22.5392 27.9109 21.9257 28.1663 21.2093 28.1663H4.79058ZM21.7222 3.39072H4.27775V25.5595C4.27775 25.7091 4.32761 25.8319 4.42733 25.9281C4.52705 26.0243 4.64814 26.0723 4.79058 26.0723H21.2093C21.3376 26.0723 21.4551 26.0189 21.5619 25.9121C21.6687 25.8052 21.7222 25.6877 21.7222 25.5595V3.39072ZM8.81413 22.6151H10.9081V6.82018H8.81413V22.6151ZM15.0918 22.6151H17.1858V6.82018H15.0918V22.6151Z"
                              fill="#1C1B1F"
                            />
                          </svg>
                        </div>
                        <div className="col-span-10 text-left flex items-center">
                          <span className="pl-4">
                            Delete <strong>({data && data.length}) files</strong>
                          </span>
                        </div>
                      </div>
                      {!hasFolderSelected && (
                        <div onClick={moveItem} className="cursor-pointer grid grid-cols-12 mb-8">
                          <div className="col-span-1">
                            <svg
                              width="32"
                              height="25"
                              viewBox="0 0 32 25"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M16.2562 19.4995L22.0895 13.6662L16.2562 7.83288L14.7818 9.30721L18.0938 12.6192H9.91005V14.7131H18.0938L14.7818 18.0251L16.2562 19.4995ZM2.79039 24.4995C2.07405 24.4995 1.4605 24.2416 0.949719 23.726C0.438969 23.2103 0.183594 22.5992 0.183594 21.8926V2.74746C0.183594 2.0409 0.438969 1.42979 0.949719 0.914125C1.4605 0.398458 2.07405 0.140625 2.79039 0.140625H13.7306L16.0168 2.42692H29.2433C29.9499 2.42692 30.561 2.68475 31.0766 3.20042C31.5923 3.71608 31.8501 4.32718 31.8501 5.03371V21.8926C31.8501 22.5992 31.5923 23.2103 31.0766 23.726C30.561 24.2416 29.9499 24.4995 29.2433 24.4995H2.79039ZM2.27755 2.74746V21.8926C2.27755 22.0422 2.32741 22.1651 2.42714 22.2613C2.52686 22.3574 2.64794 22.4055 2.79039 22.4055H29.2433C29.3929 22.4055 29.5158 22.3574 29.6119 22.2613C29.7081 22.1651 29.7562 22.0422 29.7562 21.8926V5.03371C29.7562 4.88413 29.7081 4.76126 29.6119 4.66513C29.5158 4.56896 29.3929 4.52088 29.2433 4.52088H15.1633L12.877 2.23458H2.79039C2.64794 2.23458 2.52686 2.28267 2.42714 2.37883C2.32741 2.475 2.27755 2.59787 2.27755 2.74746ZM2.27755 2.74746V2.23458V22.4055V2.74746Z"
                                fill="#1C1B1F"
                              />
                            </svg>
                          </div>
                          <div className="col-span-10 text-left flex items-center">
                            <span className="pl-4">
                              Move <strong>({data && data.length}) files</strong>
                            </span>
                          </div>
                        </div>
                      )}
                      <div
                        onClick={close}
                        className="cursor-pointer mt-5 -mb-2 border-b w-fit mx-auto border-b-black pb-0.5"
                      >
                        Cancel
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

export default MultipleMenu;
