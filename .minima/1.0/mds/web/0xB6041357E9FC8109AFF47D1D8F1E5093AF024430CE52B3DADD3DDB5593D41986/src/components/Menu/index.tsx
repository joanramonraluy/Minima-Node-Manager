import { useTransition, animated } from '@react-spring/web';
import route from '../../assets/route.svg';
import share from '../../assets/share.svg';
import { getPath } from "../../__minima__";
import { isMinimaBrowser } from "../../env";
import * as minima from "../../__minima__";

export function Menu({ data, setDisplayDelete, setDisplayMove, setDisplayRename, setDisplayCopyPath, display, close }: any) {
  const transition: any = useTransition(display, {
    from: {
      y: '20%',
      scale: 1,
      opacity: 0.8,
    },
    enter: {
      y: '0%',
      scale: 1,
      opacity: 1,
    },
    leave: {
      y: '80%',
      scale: 1,
      opacity: 0,
    },
    config: {
      duration: 100,
    },
  } as any);

  const downloadFile = async () => {
    await minima.downloadFile(data.file.location, data.file.name);
    close();
  };

  const deleteItem = () => {
    close();
    setDisplayDelete(data);
  };

  const renameItem = () => {
    close();
    setDisplayRename(data);
  };

  const moveItem = () => {
    close();
    setDisplayMove(data);
  };

  const copyPath = () => {
    close();
    setDisplayCopyPath(data);
  };

  const shareFile = async () => {
    const path = await getPath(data.file.location);
    Android.shareFile(path.getpath.path, "*/*");
  }

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
                      {data && data.file.isfile && (
                        <div onClick={downloadFile} className="cursor-pointer grid grid-cols-12 mb-7">
                          <div className="col-span-1">
                            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3.10683 25.5003C2.3905 25.5003 1.77694 25.2449 1.26617 24.7341C0.755389 24.2233 0.5 23.6098 0.5 22.8935V17.9384H2.59396V22.8935C2.59396 23.0217 2.64739 23.1392 2.75425 23.246C2.86108 23.3529 2.97861 23.4063 3.10683 23.4063H22.8931C23.0213 23.4063 23.1388 23.3529 23.2457 23.246C23.3525 23.1392 23.406 23.0217 23.406 22.8935V17.9384H25.4999V22.8935C25.4999 23.6098 25.2445 24.2233 24.7337 24.7341C24.223 25.2449 23.6094 25.5003 22.8931 25.5003H3.10683ZM13 19.167L6.02571 12.1927L7.51708 10.6949L11.953 15.1201V0.211914H14.0469V15.1201L18.4828 10.6949L19.9742 12.1927L13 19.167Z" fill="#1C1B1F"/>
                            </svg>
                          </div>
                          <div className="col-span-10 text-left flex items-center">
                            <span className="pl-4">Download</span>
                          </div>
                        </div>
                      )}
                      <div onClick={deleteItem} className="cursor-pointer grid grid-cols-12 mb-7">
                        <div className="col-span-1">
                          <svg width="26" height="29" viewBox="0 0 26 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M4.79058 28.1663C4.07656 28.1663 3.46358 27.9103 2.95167 27.3984C2.43975 26.8865 2.18379 26.2735 2.18379 25.5595V3.39072H0.5V1.29677H7.75208V0.0253906H18.2478V1.29677H25.4999V3.39072H23.8161V25.5595C23.8161 26.2758 23.5607 26.8894 23.05 27.4001C22.5392 27.9109 21.9257 28.1663 21.2093 28.1663H4.79058ZM21.7222 3.39072H4.27775V25.5595C4.27775 25.7091 4.32761 25.8319 4.42733 25.9281C4.52705 26.0243 4.64814 26.0723 4.79058 26.0723H21.2093C21.3376 26.0723 21.4551 26.0189 21.5619 25.9121C21.6687 25.8052 21.7222 25.6877 21.7222 25.5595V3.39072ZM8.81413 22.6151H10.9081V6.82018H8.81413V22.6151ZM15.0918 22.6151H17.1858V6.82018H15.0918V22.6151Z"
                              fill="#1C1B1F"
                            />
                          </svg>
                        </div>
                        <div className="col-span-10 text-left flex items-center">
                          <span className="pl-4">Delete</span>
                        </div>
                      </div>
                      {data && data.file.isfile && (
                        <div onClick={moveItem} className="cursor-pointer grid grid-cols-12 mb-7">
                          <div className="col-span-1">
                            <svg width="32" height="25" viewBox="0 0 32 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M16.2562 19.4995L22.0895 13.6662L16.2562 7.83288L14.7818 9.30721L18.0938 12.6192H9.91005V14.7131H18.0938L14.7818 18.0251L16.2562 19.4995ZM2.79039 24.4995C2.07405 24.4995 1.4605 24.2416 0.949719 23.726C0.438969 23.2103 0.183594 22.5992 0.183594 21.8926V2.74746C0.183594 2.0409 0.438969 1.42979 0.949719 0.914125C1.4605 0.398458 2.07405 0.140625 2.79039 0.140625H13.7306L16.0168 2.42692H29.2433C29.9499 2.42692 30.561 2.68475 31.0766 3.20042C31.5923 3.71608 31.8501 4.32718 31.8501 5.03371V21.8926C31.8501 22.5992 31.5923 23.2103 31.0766 23.726C30.561 24.2416 29.9499 24.4995 29.2433 24.4995H2.79039ZM2.27755 2.74746V21.8926C2.27755 22.0422 2.32741 22.1651 2.42714 22.2613C2.52686 22.3574 2.64794 22.4055 2.79039 22.4055H29.2433C29.3929 22.4055 29.5158 22.3574 29.6119 22.2613C29.7081 22.1651 29.7562 22.0422 29.7562 21.8926V5.03371C29.7562 4.88413 29.7081 4.76126 29.6119 4.66513C29.5158 4.56896 29.3929 4.52088 29.2433 4.52088H15.1633L12.877 2.23458H2.79039C2.64794 2.23458 2.52686 2.28267 2.42714 2.37883C2.32741 2.475 2.27755 2.59787 2.27755 2.74746ZM2.27755 2.74746V2.23458V22.4055V2.74746Z"
                                fill="#1C1B1F"
                              />
                            </svg>
                          </div>
                          <div className="col-span-10 text-left flex items-center">
                            <span className="pl-4">Move</span>
                          </div>
                        </div>
                      )}
                      <div onClick={copyPath} className="cursor-pointer grid grid-cols-12 mb-5">
                        <div className="col-span-1">
                          <img src={route} alt="Copy path" />
                        </div>
                        <div className="col-span-10 text-left flex items-center">
                          <span className="pl-4">File path</span>
                        </div>
                      </div>
                      {isMinimaBrowser && (
                        <div onClick={shareFile} className="cursor-pointer grid grid-cols-12 mb-5">
                          <div className="col-span-1">
                            <img src={share} alt="Share" />
                          </div>
                          <div className="col-span-10 text-left flex items-center">
                            <span className="pl-4">Share</span>
                          </div>
                        </div>
                      )}
                      <div onClick={renameItem} className="cursor-pointer grid grid-cols-12 mb-8">
                        <div className="col-span-1">
                          <svg width="26" height="30" viewBox="0 0 32 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M11.3901 29.1671L16 24.5732H31.8346V29.1671H11.3901ZM2.26193 27.0732H4.07497L21.5035 9.65532L19.6798 7.83162L2.26193 25.2601V27.0732ZM25.9585 8.14682L21.1797 3.38516L23.0868 1.47816C23.4828 1.08216 23.9767 0.887005 24.5686 0.892699C25.1604 0.898394 25.6579 1.1028 26.061 1.50591L27.8569 3.30182C28.2529 3.69782 28.4538 4.18606 28.4595 4.76653C28.4652 5.34701 28.2665 5.8388 27.8633 6.24191L25.9585 8.14682ZM24.4671 9.63607L4.93605 29.1671H0.167969V24.399L19.699 4.86803L24.4671 9.63607ZM20.5889 8.73012L19.6798 7.83162L21.5035 9.65532L20.5889 8.73012Z"
                              fill="#1C1B1F"
                            />
                          </svg>
                        </div>
                        <div className="col-span-10 text-left flex items-center">
                          <span className="pl-4">Rename</span>
                        </div>
                      </div>
                      <div onClick={close} className="cursor-pointer mt-5 -mb-2 border-b w-fit mx-auto border-b-black pb-0.5">
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

export default Menu;
