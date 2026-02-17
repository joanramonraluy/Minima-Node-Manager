import * as React from 'react';
import { useTransition, animated } from '@react-spring/web';
import { useContext, useState } from 'react';
import { appContext } from '../../AppContext';
import { modalAnimation } from '../../animations';

export function CreateFolder({ display, close, callback, createFolder }: any) {
  const { promptNotification } = useContext(appContext);
  const [folderName, setFolderName] = useState('');

  const transition = useTransition(display, modalAnimation);

  const handleOnChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    setFolderName(evt.target.value);
  };

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();

    await createFolder(folderName);
    setFolderName('');
    promptNotification('Folder successfully created');
    callback();
    close();
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
                    <form onSubmit={handleSubmit}>
                      <h5 className="font-bold text-lg -mt-2 mb-5">Create folder</h5>
                      <input onChange={handleOnChange} value={folderName} type="text" className="input w-full px-4 py-3 mb-5" />
                      <div className="text-center">
                        <button className="button button--thick w-full">Create folder</button>
                        <div onClick={close} className="mt-5 -mb-2 border-b w-fit mx-auto border-b-black pb-0.5">
                          Cancel
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

export default CreateFolder;
