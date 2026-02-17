import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { makeFolder, moveFile } from '../../__minima__';
import { useFileList, useHelpers } from '../../hooks';
import File from '../File';
import { Menu, MoveItem, DeleteItem, RenameItem, MultipleMenu, CreateFolder, Notification } from '../../components';
import { formatBytes } from '../../utilities';
import CopyPath from '../../components/CopyPath';
import ErrorModal from '../../components/Error';
import LoadingModal from '../../components/LoadingModal';
import { MinimaFile } from '../../types';
import SettingsDrawer from '../../components/SettingsDrawer';
import { appContext } from '../../AppContext';

const Home = () => {
  const { showHiddenItems } = useContext(appContext);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { title, previousPath, list, path, setPath, canonical, reloadDirectory } = useFileList(true);
  const { renderIcon } = useHelpers();

  const [, setFile] = useState(undefined);
  const [error, setError] = useState(false);

  const [displayFile, setDisplayFile] = useState<MinimaFile | false>(false);
  const [displayMove, setDisplayMove] = useState<{ file: MinimaFile; path: string } | string[] | false>(false);
  const [displaySearch, setDisplaySearch] = useState(false);
  const [displayMenu, setDisplayMenu] = useState<{ file: MinimaFile; path: string } | string[] | false>(false);
  const [displayRename, setDisplayRename] = useState<boolean | null>(null);
  const [displayDelete, setDisplayDelete] = useState<{ file: MinimaFile; path?: string } | string[] | false>(false);
  const [displayCreateFolder, setDisplayCreateFolder] = useState(false);
  const [displayMultipleMenu, setDisplayMultipleMenu] = useState<string[] | false>(false);
  const [displaySettings, setDisplaySettings] = useState(false);
  const [displayCopyPath, setDisplayCopyPath] = useState<MinimaFile | false>(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<any>(null);
  const [checked, setChecked] = useState<string[]>([]);

  /**
   * Reset checked if path or list changes
   */
  useEffect(() => {
    setChecked([]);
  }, [path, list]);

  /**
   * If upload takes too long, show error!
   */
  useEffect(() => {
    if (uploading) {
      const timeout = setTimeout(() => {
        if (fileInput.current) {
          (fileInput.current as any).value = null;
        }

        setUploading(false);
        setError(true);
      }, 180000);

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [uploading]);

  /**
   * Upload file if file was selected
   * @param evt
   * @returns {Promise<void>}
   */
  const handleFileOnChange = async (evt: any) => {
    try {
      const file = evt.target.files[0];
      setFile(file);

      if (file) {
        setUploading(true);
        setProgress(null);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        MDS.file.upload(file, async function (resp) {
          if (resp.allchunks >= 10) {
            setProgress(resp.chunk / resp.allchunks);
          }

          if (resp.allchunks === resp.chunk) {
            setFile(undefined);
            setUploading(false);
            await moveFile('/fileupload/' + file.name, path + '/' + file.name);
            reloadDirectory();

            if (fileInput.current) {
              (fileInput.current as any).value = null;
            }
          }
        });
      }
    } catch (e) {
      setUploading(false);
      reloadDirectory();
    }
  };

  /**
   * Creates a new folder
   * @param {string} folderName
   * @returns {Promise<void>}
   */
  const createFolder = async (folderName: string) => {
    const parent = path === '/' ? '' : path + '/';
    await makeFolder(parent + folderName);
  };

  const showCreateFolder = () => {
    setDisplayCreateFolder(true);
  };

  const showMenu = (file: any) => {
    setDisplayMenu({
      file,
      path,
    });
  };

  const showSearch = () => {
    setDisplaySearch(true);
  };

  const openMultipleMenu = () => {
    setDisplayMultipleMenu(checked);
  };

  const handleSearch = (evt: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(evt.target.value);
  };

  /**
   * Returns list in order based on sort
   * @type {any}
   */
  const files = useMemo(() => {
    if (!list) {
      return null;
    }

    let orderedList = list;

    if (!sort) {
      orderedList = orderedList.sort((a: any, b: any) => b.isdir - a.isdir);
    }

    if (sort === 'ASC') {
      orderedList = orderedList.sort((a: any, b: any) =>
        a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() < b.name.toLowerCase() ? 1 : 0
      );
    }

    if (sort === 'DESC') {
      orderedList = orderedList
        .sort((a: any, b: any) =>
          a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() < b.name.toLowerCase() ? 1 : 0
        )
        .reverse();
    }

    if (query !== '') {
      orderedList = orderedList.filter((i: any) =>
        !query ? true : i.name.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (!showHiddenItems) {
      orderedList = orderedList.filter((i: any) => i.location !== '/fileupload');
    }

    return orderedList;
  }, [list, query, sort, showHiddenItems]);

  /**
   * Toggles all files so that they're either all selected or all not selected
   */
  const toggleAll = () => {
    if (checked.length === list.length) {
      setChecked([]);
    } else {
      setChecked(
        list
          .map((i: any) => i.location)
          .filter((i) => {
            if (!showHiddenItems) {
              return i !== '/fileupload';
            }

            return true;
          })
      );
    }
  };

  /**
   * Toggles a directory or file so they're selected
   * @param file
   */
  const toggleChecked = (file: any) => {
    if (checked.includes(file.location)) {
      setChecked((prevState) => prevState.filter((i) => i !== file.location));
    } else {
      setChecked((prevState) => [...prevState, file.location]);
    }
  };

  const hideSearch = () => {
    setDisplaySearch(false);
    setQuery('');
  };

  const hideFile = () => {
    setDisplayFile(false);
  };

  const hideRename = () => {
    setDisplayRename(false);
  };

  const hideMove = () => {
    setDisplayMove(false);
  };

  const hideMenu = () => {
    setDisplayMenu(false);
  };

  const hideCreateFolder = () => {
    setDisplayCreateFolder(false);
  };

  const hideDelete = () => {
    setDisplayDelete(false);
    setDisplayFile(false);
  };

  const hideMultipleMenu = () => {
    setDisplayMultipleMenu(false);
  };

  if (displayFile) {
    return (
      <div>
        <DeleteItem data={displayDelete} display={!!displayDelete} close={hideDelete} callback={reloadDirectory} />
        <File data={displayFile} setDisplayDelete={setDisplayDelete} close={hideFile} />
      </div>
    );
  }

  const noFiles = files && files.length === 0;
  const hasQuery = query !== '';

  return (
    <div>
      <LoadingModal display={uploading} progress={progress} />
      <ErrorModal display={error} dismiss={() => setError(false)} />
      <MoveItem data={displayMove} display={!!displayMove} close={hideMove} callback={reloadDirectory} />
      <Menu
        data={displayMenu}
        display={!!displayMenu}
        setDisplayMove={setDisplayMove}
        setDisplayRename={setDisplayRename}
        setDisplayDelete={setDisplayDelete}
        close={hideMenu}
        displayCopyPath={displayCopyPath}
        setDisplayCopyPath={setDisplayCopyPath}
      />
      <MultipleMenu
        data={displayMultipleMenu}
        display={!!displayMultipleMenu}
        setDisplayMove={setDisplayMove}
        setDisplayDelete={setDisplayDelete}
        close={hideMultipleMenu}
      />
      <CreateFolder
        display={displayCreateFolder}
        close={hideCreateFolder}
        createFolder={createFolder}
        callback={reloadDirectory}
      />
      <SettingsDrawer display={displaySettings} close={() => setDisplaySettings(false)} />
      <DeleteItem data={displayDelete} display={!!displayDelete} close={hideDelete} callback={reloadDirectory} />
      <RenameItem data={displayRename} display={!!displayRename} close={hideRename} callback={reloadDirectory} />
      <CopyPath data={displayCopyPath} display={!!displayCopyPath} close={() => setDisplayCopyPath(false)} />
      <div>
        <div className="grid grid-cols-2 p-5">
          <div className="col-span-1 flex items-center">
            <div
              onClick={() => (previousPath ? setPath(previousPath) : null)}
              className={`cursor-pointer flex items-center ${previousPath ? '' : 'opacity-0'}`}
            >
              <svg
                className="mr-5"
                width="12"
                height="20"
                viewBox="0 0 12 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.99953 19.6534L0.345703 9.99953L9.99953 0.345703L11.4187 1.7649L3.18413 9.99953L11.4187 18.2342L9.99953 19.6534Z"
                  fill="#1C1B1F"
                />
              </svg>
              Back
            </div>
          </div>
          <div onClick={() => setDisplaySettings(true)} className="col-span-1 flex items-center justify-end gap-4">
            <svg
              onClick={showSearch}
              className="cursor-pointer"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M16.1384 17.1923L9.85765 10.9115C9.35765 11.3243 8.78265 11.6474 8.13265 11.8807C7.48265 12.114 6.81022 12.2307 6.11535 12.2307C4.40618 12.2307 2.95967 11.6389 1.7758 10.4554C0.591933 9.27178 0 7.82564 0 6.11693C0 4.40819 0.591784 2.96152 1.77535 1.7769C2.95892 0.5923 4.40507 0 6.1138 0C7.82252 0 9.26918 0.591933 10.4538 1.7758C11.6384 2.95967 12.2307 4.40618 12.2307 6.11535C12.2307 6.82945 12.1109 7.5115 11.8711 8.1615C11.6314 8.8115 11.3115 9.37689 10.9115 9.85765L17.1922 16.1384L16.1384 17.1923ZM6.11535 10.7308C7.40382 10.7308 8.49517 10.2836 9.3894 9.3894C10.2836 8.49517 10.7308 7.40382 10.7308 6.11535C10.7308 4.82688 10.2836 3.73553 9.3894 2.8413C8.49517 1.94707 7.40382 1.49995 6.11535 1.49995C4.82688 1.49995 3.73553 1.94707 2.8413 2.8413C1.94708 3.73553 1.49998 4.82688 1.49998 6.11535C1.49998 7.40382 1.94708 8.49517 2.8413 9.3894C3.73553 10.2836 4.82688 10.7308 6.11535 10.7308Z"
                fill="#08090B"
              />
            </svg>
            <svg
              className="cursor-pointer"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <mask id="mask0_56_4179" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <rect width="24" height="24" fill="#D9D9D9" />
              </mask>
              <g mask="url(#mask0_56_4179)">
                <path
                  d="M12 19.2688C11.5875 19.2688 11.2344 19.122 10.9406 18.8282C10.6469 18.5345 10.5 18.1814 10.5 17.7689C10.5 17.3564 10.6469 17.0033 10.9406 16.7095C11.2344 16.4158 11.5875 16.2689 12 16.2689C12.4125 16.2689 12.7656 16.4158 13.0593 16.7095C13.3531 17.0033 13.5 17.3564 13.5 17.7689C13.5 18.1814 13.3531 18.5345 13.0593 18.8282C12.7656 19.122 12.4125 19.2688 12 19.2688ZM12 13.4996C11.5875 13.4996 11.2344 13.3527 10.9406 13.059C10.6469 12.7652 10.5 12.4121 10.5 11.9996C10.5 11.5872 10.6469 11.234 10.9406 10.9403C11.2344 10.6465 11.5875 10.4997 12 10.4997C12.4125 10.4997 12.7656 10.6465 13.0593 10.9403C13.3531 11.234 13.5 11.5872 13.5 11.9996C13.5 12.4121 13.3531 12.7652 13.0593 13.059C12.7656 13.3527 12.4125 13.4996 12 13.4996ZM12 7.73039C11.5875 7.73039 11.2344 7.58352 10.9406 7.28977C10.6469 6.99604 10.5 6.64292 10.5 6.23042C10.5 5.81794 10.6469 5.46482 10.9406 5.17107C11.2344 4.87734 11.5875 4.73047 12 4.73047C12.4125 4.73047 12.7656 4.87734 13.0593 5.17107C13.3531 5.46482 13.5 5.81794 13.5 6.23042C13.5 6.64292 13.3531 6.99604 13.0593 7.28977C12.7656 7.58352 12.4125 7.73039 12 7.73039Z"
                  fill="#08090B"
                />
              </g>
            </svg>
          </div>
        </div>
        <div className="pt-2 pb-5 pl-5 pr-5">
          <h1 className="font-bold text-2xl text-overflow">{title}</h1>
        </div>
        {displaySearch && (
          <div className="search-bar p-3 flex items-center">
            <div className="search-bar__input flex-grow">
              <label className="flex items-center justify-center">
                <svg
                  className="search-bar__icon"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16.1384 17.1923L9.85765 10.9115C9.35765 11.3243 8.78265 11.6474 8.13265 11.8807C7.48265 12.114 6.81022 12.2307 6.11535 12.2307C4.40618 12.2307 2.95967 11.6389 1.7758 10.4554C0.591933 9.27178 0 7.82564 0 6.11693C0 4.40819 0.591784 2.96152 1.77535 1.7769C2.95892 0.5923 4.40507 0 6.1138 0C7.82252 0 9.26918 0.591933 10.4538 1.7758C11.6384 2.95967 12.2307 4.40618 12.2307 6.11535C12.2307 6.82945 12.1109 7.5115 11.8711 8.1615C11.6314 8.8115 11.3115 9.37688 10.9115 9.85765L17.1922 16.1384L16.1384 17.1923ZM6.11535 10.7308C7.40382 10.7308 8.49517 10.2836 9.3894 9.3894C10.2836 8.49517 10.7308 7.40382 10.7308 6.11535C10.7308 4.82688 10.2836 3.73553 9.3894 2.8413C8.49517 1.94707 7.40382 1.49995 6.11535 1.49995C4.82688 1.49995 3.73553 1.94707 2.8413 2.8413C1.94708 3.73553 1.49998 4.82688 1.49998 6.11535C1.49998 7.40382 1.94708 8.49517 2.8413 9.3894C3.73553 10.2836 4.82688 10.7308 6.11535 10.7308Z"
                    fill="#08090B"
                  />
                </svg>
                <input
                  type="text"
                  className="search-bar__input-item"
                  placeholder={`Search ${title.toLowerCase()}`}
                  value={query}
                  onChange={handleSearch}
                />
              </label>
            </div>
            <div className="ml-3">
              <svg
                onClick={hideSearch}
                className="cursor-pointer"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.39998 14.6538L9.99998 11.0538L13.6 14.6538L14.6538 13.6L11.0538 9.99998L14.6538 6.39998L13.6 5.34615L9.99998 8.94615L6.39998 5.34615L5.34615 6.39998L8.94615 9.99998L5.34615 13.6L6.39998 14.6538ZM10.0016 19.5C8.68772 19.5 7.45268 19.2506 6.29655 18.752C5.1404 18.2533 4.13472 17.5765 3.2795 16.7217C2.42427 15.8669 1.74721 14.8616 1.24833 13.706C0.749442 12.5504 0.5 11.3156 0.5 10.0017C0.5 8.68772 0.749334 7.45268 1.248 6.29655C1.74667 5.1404 2.42342 4.13472 3.27825 3.2795C4.1331 2.42427 5.13834 1.74721 6.29398 1.24833C7.44959 0.749442 8.68437 0.5 9.9983 0.5C11.3122 0.5 12.5473 0.749333 13.7034 1.248C14.8596 1.74667 15.8652 2.42342 16.7205 3.27825C17.5757 4.1331 18.2527 5.13834 18.7516 6.29398C19.2505 7.44959 19.5 8.68437 19.5 9.9983C19.5 11.3122 19.2506 12.5473 18.752 13.7034C18.2533 14.8596 17.5765 15.8652 16.7217 16.7205C15.8669 17.5757 14.8616 18.2527 13.706 18.7516C12.5504 19.2505 11.3156 19.5 10.0016 19.5Z"
                  fill="white"
                />
              </svg>
            </div>
          </div>
        )}
        {!displaySearch && (
          <div className="flex gap-2 pl-5 pr-5 pb-2">
            <label className="button cursor-pointer">
              Upload file
              <input type="file" ref={fileInput} onChange={handleFileOnChange} className="button hidden" />
            </label>
            <button onClick={showCreateFolder} className="button">
              Create folder
            </button>
            {checked.length > 1 && (
              <button onClick={openMultipleMenu} className="button button--wide">
                <svg width="4" height="16" viewBox="0 0 4 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M1.99997 15.2688C1.58749 15.2688 1.23438 15.122 0.940625 14.8282C0.646875 14.5345 0.5 14.1814 0.5 13.7689C0.5 13.3564 0.646875 13.0033 0.940625 12.7095C1.23438 12.4158 1.58749 12.2689 1.99997 12.2689C2.41246 12.2689 2.76558 12.4158 3.05933 12.7095C3.35308 13.0033 3.49995 13.3564 3.49995 13.7689C3.49995 14.1814 3.35308 14.5345 3.05933 14.8282C2.76558 15.122 2.41246 15.2688 1.99997 15.2688ZM1.99997 9.49962C1.58749 9.49962 1.23438 9.35274 0.940625 9.05899C0.646875 8.76524 0.5 8.41213 0.5 7.99964C0.5 7.58716 0.646875 7.23404 0.940625 6.94029C1.23438 6.64654 1.58749 6.49967 1.99997 6.49967C2.41246 6.49967 2.76558 6.64654 3.05933 6.94029C3.35308 7.23404 3.49995 7.58716 3.49995 7.99964C3.49995 8.41213 3.35308 8.76524 3.05933 9.05899C2.76558 9.35274 2.41246 9.49962 1.99997 9.49962ZM1.99997 3.73039C1.58749 3.73039 1.23438 3.58352 0.940625 3.28977C0.646875 2.99604 0.5 2.64292 0.5 2.23042C0.5 1.81794 0.646875 1.46482 0.940625 1.17107C1.23438 0.877335 1.58749 0.730469 1.99997 0.730469C2.41246 0.730469 2.76558 0.877335 3.05933 1.17107C3.35308 1.46482 3.49995 1.81794 3.49995 2.23042C3.49995 2.64292 3.35308 2.99604 3.05933 3.28977C2.76558 3.58352 2.41246 3.73039 1.99997 3.73039Z"
                    fill="white"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="border-b-2 border-b-black">
          <div className="flex items-center p-5">
            {!noFiles && (
              <div className="mr-4">
                <input
                  type="checkbox"
                  className="checkbox"
                  readOnly
                  checked={list ? (showHiddenItems ? list.length : list.length - 1) === checked.length : false}
                  onClick={toggleAll}
                />
              </div>
            )}
            <span className="mr-3">Name</span>
            <div
              className={`transition-transform cursor-pointer ${sort === 'ASC' ? 'rotate-180' : ''}`}
              onClick={() => setSort(sort === 'DESC' || !sort ? 'ASC' : 'DESC')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M7.99988 0.384535L15.6152 7.99988L14.5614 9.06908L8.74986 3.25754L8.74986 15.6152L7.24991 15.6152L7.24991 3.25754L1.43836 9.06909L0.384533 7.99989L7.99988 0.384535Z"
                  fill="#08090B"
                />
              </svg>
            </div>
          </div>
        </div>
        <Notification />
        <div className="flex flex-col p-5">
          {files &&
            files.map((file: any) => {
              return (
                <div
                  key={file.name}
                  className={`item cursor-pointer flex items-center p-1 ${
                    checked.includes(file.location) ? 'item__selected' : ''
                  }`}
                >
                  <div className="flex items-center pr-5">
                    <input
                      type="checkbox"
                      className="checkbox"
                      readOnly
                      checked={checked.includes(file.location)}
                      onClick={() => toggleChecked(file)}
                    />
                  </div>
                  <div
                    onClick={() => (file.isdir ? setPath(canonical + '/' + file.name) : setDisplayFile(file))}
                    className="pr-5"
                  >
                    {renderIcon(file)}
                  </div>
                  <div
                    onClick={() => (file.isdir ? setPath(canonical + '/' + file.name) : setDisplayFile(file))}
                    className="flex-grow text-overflow"
                  >
                    <div className="w-full text-overflow pr-5">{file.name}</div>
                    {!file.isdir && <div className="text-custom-grey text-sm">{formatBytes(file.size)}</div>}
                  </div>
                  <div onClick={() => showMenu(file)} className="cursor-pointer px-3 py-3">
                    <svg width="4" height="16" viewBox="0 0 4 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M1.99997 15.2688C1.58749 15.2688 1.23438 15.122 0.940625 14.8282C0.646875 14.5345 0.5 14.1814 0.5 13.7689C0.5 13.3564 0.646875 13.0033 0.940625 12.7095C1.23438 12.4158 1.58749 12.2689 1.99997 12.2689C2.41246 12.2689 2.76558 12.4158 3.05933 12.7095C3.35308 13.0033 3.49995 13.3564 3.49995 13.7689C3.49995 14.1814 3.35308 14.5345 3.05933 14.8282C2.76558 15.122 2.41246 15.2688 1.99997 15.2688ZM1.99997 9.49962C1.58749 9.49962 1.23438 9.35274 0.940625 9.05899C0.646875 8.76524 0.5 8.41213 0.5 7.99964C0.5 7.58716 0.646875 7.23404 0.940625 6.94029C1.23438 6.64654 1.58749 6.49967 1.99997 6.49967C2.41246 6.49967 2.76558 6.64654 3.05933 6.94029C3.35308 7.23404 3.49995 7.58716 3.49995 7.99964C3.49995 8.41213 3.35308 8.76524 3.05933 9.05899C2.76558 9.35274 2.41246 9.49962 1.99997 9.49962ZM1.99997 3.73039C1.58749 3.73039 1.23438 3.58352 0.940625 3.28977C0.646875 2.99604 0.5 2.64292 0.5 2.23042C0.5 1.81794 0.646875 1.46482 0.940625 1.17107C1.23438 0.877335 1.58749 0.730469 1.99997 0.730469C2.41246 0.730469 2.76558 0.877335 3.05933 1.17107C3.35308 1.46482 3.49995 1.81794 3.49995 2.23042C3.49995 2.64292 3.35308 2.99604 3.05933 3.28977C2.76558 3.58352 2.41246 3.73039 1.99997 3.73039Z"
                        fill="#1C1B1F"
                      />
                    </svg>
                  </div>
                </div>
              );
            })}
          {noFiles && hasQuery && (
            <div className="py-10 text-center">
              <div className="flex flex-col justify-center gap-5">
                <h5 className="text-xl mx-5 mb-6">No results</h5>
              </div>
            </div>
          )}
          {noFiles && !hasQuery && (
            <div className="max-w-sm py-10 lg:py-20 text-center mx-auto">
              <div className="flex flex-col justify-center gap-5">
                <h5 className="text-xl mx-5 mb-6">Your Files are empty, let’s add some</h5>
                <label className="button button--thick cursor-pointer">
                  Add a file
                  <input type="file" onChange={handleFileOnChange} className="button hidden" />
                </label>
                <button onClick={showCreateFolder} className="block button button--thick">
                  Create folder
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
