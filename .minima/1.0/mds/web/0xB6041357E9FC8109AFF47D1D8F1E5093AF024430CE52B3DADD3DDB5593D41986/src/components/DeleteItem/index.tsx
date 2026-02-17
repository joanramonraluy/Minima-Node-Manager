import { useTransition, animated } from '@react-spring/web';
import { deleteFile } from '../../__minima__';
import { modalAnimation } from '../../animations';

export function DeleteItem({ display, data, close, callback }: any) {
  const multiple = Array.isArray(data);
  const transition: any = useTransition(display, modalAnimation as any);

  const handleOnSubmit = async (evt: any) => {
    evt.preventDefault();

    // if data is multiple files, we delete each file as a task
    if (multiple) {
      for (const file of data) {
        await deleteFile(file);
      }
    } else {
      await deleteFile(data.file.location);
    }

    close();
    callback();
  }

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
                      <div className="text-center">
                        <svg className="mx-auto mb-8" width="39" height="43" viewBox="0 0 39 43" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M7.18587 42.2504C6.11483 42.2504 5.19537 41.8665 4.4275 41.0986C3.65962 40.3307 3.27569 39.4112 3.27569 38.3402V5.08706H0.75V1.94613H11.6281V0.0390625H27.3717V1.94613H38.2499V5.08706H35.7242V38.3402C35.7242 39.4147 35.3411 40.335 34.575 41.1012C33.8088 41.8674 32.8885 42.2504 31.814 42.2504H7.18587ZM32.5833 5.08706H6.41662V38.3402C6.41662 38.5646 6.49142 38.7489 6.641 38.8931C6.79058 39.0374 6.97221 39.1095 7.18587 39.1095H31.814C32.0063 39.1095 32.1826 39.0294 32.3429 38.8691C32.5031 38.7088 32.5833 38.5325 32.5833 38.3402V5.08706ZM13.2212 33.9236H16.3621V10.2312H13.2212V33.9236ZM22.6377 33.9236H25.7787V10.2312H22.6377V33.9236Z"
                            fill="#1C1B1F"
                          />
                        </svg>
                        <h5 className="font-bold -mt-2 mb-8 mx-auto" style={{ fontSize: '22px' }}>
                          Are you sure you want to delete {multiple ?  `these items` : `this ${data && data.file.isdir ? 'folder' : 'file'}`}?
                        </h5>
                        <div className="text-center">
                          <button className="button button--thick w-full">Confirm</button>
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

export default DeleteItem;
