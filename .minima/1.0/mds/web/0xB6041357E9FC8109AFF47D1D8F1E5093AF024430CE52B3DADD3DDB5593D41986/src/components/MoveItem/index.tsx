import { useContext, useEffect } from 'react';
import { useTransition, animated } from '@react-spring/web';
import { renameFile } from '../../__minima__';
import { modalAnimation } from '../../animations';
import { useHelpers, useFileList } from '../../hooks';
import { MinimaFile } from '../../types';
import { appContext } from '../../AppContext';

type MoveItemProps = {
  display: boolean;
  data: { file: MinimaFile; path: string } | string[] | false;
  callback: () => void;
  close: () => void;
};

export function MoveItem({ display, data, close, callback }: MoveItemProps) {
  const transition: any = useTransition(display, modalAnimation as any);
  const { showHiddenItems } = useContext(appContext);
  const { list, canonical, title, previousPath, setPath } = useFileList(display);
  const { renderIcon } = useHelpers();

  /**
   * Reset path back to root if the modal is opened
   */
  useEffect(() => {
    if (display) {
      setPath('/');
    }
  }, [display, setPath]);

  const handleOnSubmit = async (evt: any) => {
    evt.preventDefault();

    if (Array.isArray(data)) {
      for (const file of data) {
        const filename = file.split('/').pop();
        await renameFile(file, canonical + '/' + filename);
      }
    } else if (data) {
      await renameFile(data.file.location, canonical + '/' + data.file.name);
    }

    close();
    callback();
  };

  const changePath = (folder: any) => {
    setPath(canonical + '/' + folder.name);
  };

  const goBack = () => {
    setPath(previousPath || '/');
  };

  return (
    <div>
      {transition((style, display) => (
        <div>
          {display && (
            <div className="restriction fixed w-screen h-screen flex justify-center items-center z-10">
              {display && (
                <div className="relative z-10 w-full">
                  <animated.div style={style} className="modal bg-white p-8 mx-auto">
                    <form onSubmit={handleOnSubmit}>
                      <div className="text-left">
                        <h5 className="font-bold -mt-1 mb-8 mx-auto" style={{ fontSize: '22px' }}>
                          Move file
                        </h5>
                        <div className="py-3 px-4 bg-black text-white">
                          {canonical === '/' ? (
                            'Files'
                          ) : (
                            <div onClick={goBack} className="flex items-center">
                              <svg
                                className="mr-4"
                                width="10"
                                height="20"
                                viewBox="0 0 12 20"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M10.4995 19.6534L0.845703 9.99953L10.4995 0.345703L11.9187 1.7649L3.68413 9.99953L11.9187 18.2342L10.4995 19.6534Z"
                                  fill="white"
                                />
                              </svg>
                              <span className="text-overflow">{title}</span>
                            </div>
                          )}
                        </div>
                        <div className="border border-black mb-4 file-list">
                          <ul className="pb-1">
                            {list &&
                              list
                                .sort((a: any, b: any) => b.isdir - a.isdir)
                                .filter((f) => {
                                  if (!showHiddenItems && f.location === '/fileupload') {
                                    return false;
                                  }

                                  return true;
                                })
                                .map((folder: any) => (
                                  <li
                                    key={folder.name}
                                    onClick={() => changePath(folder)}
                                    className={`flex items-center p-3 ${
                                      folder.isdir ? 'cursor-pointer' : 'opacity-50'
                                    }`}
                                  >
                                    <span className="mr-3">{renderIcon(folder)}</span>{' '}
                                    <span className="text-overflow">{folder.name}</span>
                                  </li>
                                ))}
                          </ul>
                        </div>
                        <div className="text-center">
                          <button className="button button--thick w-full">Move here</button>
                          <div
                            onClick={close}
                            className="cursor-pointer mt-5 border-b w-fit mx-auto border-b-black pb-0.5"
                          >
                            Cancel
                          </div>
                        </div>
                      </div>
                    </form>
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

export default MoveItem;
