import { useTransition, animated } from '@react-spring/web';
import { renameFile } from '../../__minima__';
import { useContext, useEffect, useState } from 'react';
import { appContext } from '../../AppContext';
import { modalAnimation } from '../../animations';

export function RenameItem({ display, data, close, callback }: any) {
  const { promptNotification } = useContext(appContext);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (data && display) {
      setNewName(data.file.name);
    }
  }, [display, data])

  const transition = useTransition(display, modalAnimation);

  const handleOnSubmit = async (evt: any) => {
    evt.preventDefault();

    await renameFile(data.file.location, data.path + '/' + newName);
    promptNotification(`File name changed to <b>${newName}</b>`);

    close();
    callback();
  }

  const handleOnChange = (evt: any) => setNewName(evt.target.value);

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
                        <h5 className="font-bold mb-8 mx-auto" style={{ fontSize: '22px' }}>
                          Rename file
                        </h5>
                        <input value={newName} onChange={handleOnChange} type="text" className="input w-full px-4 py-3 mb-5" />
                        <div className="text-center">
                          <button className="button button--thick w-full">Rename</button>
                          <div onClick={close} className="cursor-pointer mt-5 border-b w-fit mx-auto border-b-black pb-0.5">
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

export default RenameItem;
