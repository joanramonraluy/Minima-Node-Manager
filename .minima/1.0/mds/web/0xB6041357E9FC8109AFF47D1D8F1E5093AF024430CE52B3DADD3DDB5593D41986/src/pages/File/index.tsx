import { Dispatch, FC, SetStateAction, useContext, useEffect, useState } from "react";
import * as minima from '../../__minima__';
import * as utilities from '../../utilities';
import { appContext } from "../../AppContext";
import checkCircleSvg from "../../assets/check_circle.svg";
import Clipboard from "react-clipboard.js";
import { MinimaFile } from "../../types";

type FileProps = {
  data: MinimaFile;
  setDisplayDelete: Dispatch<SetStateAction<{ file: MinimaFile; path?: string; } | string[] | false>>;
  close: () => void;
}

const File: FC<FileProps> = ({ data, setDisplayDelete, close }) => {
  const { fullPath } = useContext(appContext);
  const [image, setImage] = useState<any>(null);
  const fileSize = utilities.formatBytes(data.size);
  const extension = utilities.getExtension(data.name);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCopied(false);
    }, 2500);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

  /**
   * Load binary file if the extension is an image
   */
  useEffect(() => {
    if (['PNG', 'JPG', 'JPEG'].includes(extension)) {
      minima.loadBinary(data.location).then((file) => {
        setImage(file);
      });
    } else {
      setImage(null);
    }
  }, [data, extension]);

  const deleteFile = () => {
    setDisplayDelete({ file: data });
  };

  const triggerDownload = () => {
    minima.downloadFile(data.location, data.name);
  }

  return (
    <div>
      <div>
        <div className="grid grid-cols-2 p-5">
          <div className="col-span-1 flex items-center">
            <div onClick={close} className={`cursor-pointer flex items-center`}>
              <svg className="mr-5" width="12" height="20" viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9.99953 19.6534L0.345703 9.99953L9.99953 0.345703L11.4187 1.7649L3.18413 9.99953L11.4187 18.2342L9.99953 19.6534Z" fill="#1C1B1F" />
              </svg>
              Back
            </div>
          </div>
        </div>
        <div className="pt-2 pb-5 pl-5 pr-5">
          <h1 className="font-bold text-2xl text-overflow">{data.name}</h1>
        </div>
        <div className="border-b-2 border-b-black">
          <div className="flex gap-3 items-center p-5">
            <button onClick={triggerDownload} className="button">
              Download
            </button>
            <button onClick={deleteFile} className="button">
              Delete
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="placeholder position-relative mx-auto">
            {image && <div className="placeholder__image" style={{ backgroundImage: `url(${image})` }}></div>}
            {!image && <div className="placeholder__image bg-placeholder" />}
          </div>
        </div>
        <div className="mx-4 mb-20">
          <div className="mb-4">
            <h5 className="text-custom-grey-2 mb-2">Name</h5>
            <div className="text-overflow">{data.name}</div>
          </div>

          <div className="mb-4">
            <h5 className="text-custom-grey-2 mb-2">Size</h5>
            <div>{fileSize}</div>
          </div>

          <div className="mb-4">
            <h5 className="text-custom-grey-2 mb-2">File Type</h5>
            <div>{extension}</div>
          </div>

          <div className="mb-4">
            <h5 className="text-custom-grey-2 mb-2">Location</h5>
            <div className="mb-4 break-words">{fullPath}{data.location}</div>

            <Clipboard data-clipboard-text={`${fullPath}${data.location}`} onClick={() => setCopied(true)}>
              <div className="relative button pr-10">
                {copied && 'Copied to clipboard'}
                {!copied && 'Copy path'}
                {copied && <img className="-mt-0.5 ml-2 inline" src={checkCircleSvg} alt="Success" width={18} />}
              </div>
            </Clipboard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default File;
