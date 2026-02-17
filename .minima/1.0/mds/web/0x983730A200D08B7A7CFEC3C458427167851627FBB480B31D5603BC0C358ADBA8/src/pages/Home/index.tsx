import { useContext, useState } from 'react';
import FullStatus from './FullStatus';
import Block from '../../components/UI/Block';
import { appContext } from '../../AppContext';
import MenuItem from '../../components/UI/MenuItem';
import ChainStatus from './ChainStatus';
import NodeStatus from '../../components/NodeStatus';
import translation from '../../../translation.json';
import TitleBlock from '../../components/TitleBlock';
import TitleBar from '../../components/TitleBar';

function Home() {
  const { statusData, networkData, maximaData, maxContactData, maxContactStats } = useContext(appContext);
  const [showFullStatus, setShowFullState] = useState(false);
  const [showChainStatus, setShowChainStatus] = useState(false);
  const isOlderVersion = !!(statusData && statusData.network && statusData.network.traffic)

  const displayFullStatus = () => setShowFullState(true);
  const hideFullStatus = () => setShowFullState(false);
  const displayChainStatus = () => setShowChainStatus(true);
  const hideChainStatus = () => setShowChainStatus(false);

  const showBack = showChainStatus || showFullStatus;

  const goBackToHome = (e: any) => {
    e.stopPropagation();
    hideChainStatus();
    hideFullStatus();
  }

  return (
    <div className="relative app text-white">
      <div>
        <FullStatus display={showFullStatus} dismiss={hideFullStatus} />
        <ChainStatus display={showChainStatus} dismiss={hideChainStatus} />

        <TitleBar showBack={showBack} back={goBackToHome} />

        <div className="relative p-4 flex flex-col gap-6 max-w-xl mx-auto">

          <div className="w-full mx-auto flex justify-center mb-6">
            <div className="text-center flex flex-col items-center gap-2">
              <svg className="block mb-2" width="49" height="48" viewBox="0 0 49 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="0.5" width="48" height="48" rx="8" fill="#00CA69" />
                <mask id="mask0_8424_11014" maskUnits="userSpaceOnUse" x="11" y="10" width="27" height="28">
                  <rect x="11.2812" y="10.7812" width="26.3438" height="26.3438" fill="#D9D9D9" />
                </mask>
                <g mask="url(#mask0_8424_11014)">
                  <path d="M24.4625 34.2997L23.1379 33.109C21.1487 31.3044 19.5037 29.7536 18.2029 28.4567C16.9021 27.1598 15.8714 26.0055 15.1106 24.994C14.3498 23.9825 13.8183 23.0598 13.516 22.2259C13.2137 21.3921 13.0625 20.5459 13.0625 19.6875C13.0625 17.9844 13.6367 16.5587 14.7852 15.4102C15.9337 14.2617 17.3594 13.6875 19.0625 13.6875C20.1102 13.6875 21.1002 13.9325 22.0325 14.4225C22.9648 14.9125 23.7748 15.6152 24.4625 16.5306C25.1502 15.6152 25.9602 14.9125 26.8925 14.4225C27.8248 13.9325 28.8148 13.6875 29.8625 13.6875C31.5655 13.6875 32.9913 14.2617 34.1398 15.4102C35.2882 16.5587 35.8624 17.9844 35.8624 19.6875C35.8624 20.5459 35.7113 21.3921 35.409 22.2259C35.1067 23.0598 34.5751 23.9825 33.8143 24.994C33.0536 26.0055 32.0247 27.1598 30.7278 28.4567C29.4309 29.7536 27.784 31.3044 25.7871 33.109L24.4625 34.2997Z" fill="white" />
                </g>
              </svg>

              <h1 className="text-2xl mb-2">Health</h1>
              <p className="text-sm max-w-xs text-grey80 mb-2">
                Monitor your node's status, including block height, sync status, and network connectivity.
              </p>
            </div>
          </div>

          <NodeStatus>
            <div className="cursor-pointer mt-4" onClick={displayChainStatus}>
              Need help?
            </div>
          </NodeStatus>

          {statusData && (
            <div className="overflow-hidden flex flex-col gap-1">
              <TitleBlock
                title="Minima"
                info={{
                  title: translation.en.MINIMA_INFO_TITLE,
                  textContent: translation.en.MINIMA_INFO_TEXT_CONTENT,
                }}
              />
              <div className="flex flex-col gap-0.5">
                <Block
                  title="Block"
                  value={statusData.chain.block}
                  info={{
                    title: translation.en.BLOCK_INFO_TITLE,
                    textContent: translation.en.BLOCK_INFO_TEXT_CONTENT,
                  }}
                />
                <Block
                  title="Block time"
                  value={statusData.chain.time}
                  info={{
                    title: translation.en.BLOCK_TIME_INFO_TITLE,
                    textContent: translation.en.BLOCK_TIME_INFO_TEXT_CONTENT,
                  }}
                />
                <Block
                  title="Version"
                  value={statusData.version}
                  info={{
                    title: translation.en.VERSION_INFO_TITLE,
                    textContent: translation.en.VERSION_INFO_TEXT_CONTENT,
                  }}
                />
                <Block
                  title="RAM"
                  value={statusData.memory.ram}
                  info={{
                    title: translation.en.RAM_INFO_TITLE,
                    textContent: translation.en.RAM_INFO_TEXT_CONTENT,
                  }}
                />
                <Block
                  title="Disk space"
                  value={statusData.memory.disk}
                  info={{
                    title: translation.en.DISK_SPACE_INFO_TITLE,
                    textContent: translation.en.DISK_SPACE_INFO_TEXT_CONTENT,
                  }}
                />
                <Block
                  title="Uptime"
                  value={statusData.uptime}
                  info={{
                    title: translation.en.UPTIME_INFO_TITLE,
                    textContent: translation.en.UPTIME_INFO_TEXT_CONTENT,
                  }}
                />
              </div>
            </div>
          )}

          {maxContactData && (
            <div className="overflow-hidden flex flex-col gap-1">
              <TitleBlock
                title="Maxima"
                info={{
                  title: translation.en.MAXIMA_INFO_TITLE,
                  textContent: translation.en.MAXIMA_INFO_TEXT_CONTENT,
                }}
              />
              <div className="flex flex-col gap-0.5">
                <Block
                  title="Contacts"
                  value={maxContactData.contacts.length}
                  info={{
                    title: translation.en.CONTACTS_INFO_TITLE,
                    textContent: translation.en.CONTACTS_INFO_TEXT_CONTENT,
                  }}
                />
                {maxContactData.contacts.length > 0 && (
                  <>
                    <Block
                      title="Same chain"
                      value={maxContactStats.sameChain}
                      info={{
                        title: translation.en.SAME_CHAIN_INFO_TITLE,
                        textContent: translation.en.SAME_CHAIN_INFO_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Network OK"
                      value={maxContactStats.ok}
                      info={{
                        title: translation.en.NETWORK_OK_INFO_TITLE,
                        textContent: translation.en.NETWORK_OK_INFO_TEXT_CONTENT,
                      }}
                    />
                  </>
                )}
                {maximaData && (
                  <Block
                    title="Poll"
                    value={maximaData.poll}
                    info={{
                      title: translation.en.POLL_INFO_TITLE,
                      textContent: translation.en.POLL_INFO_TEXT_CONTENT,
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {statusData && (
            <div className="overflow-hidden flex flex-col gap-1">
              <TitleBlock
                title="Network"
                info={{
                  title: translation.en.NETWORK_TITLE,
                  textContent: translation.en.NETWORK_TEXT_CONTENT,
                }}
              />
              <div className="flex flex-col gap-0.5">
                <Block
                  title="Connections"
                  value={statusData.network.connected}
                  info={{
                    title: translation.en.CONNECTIONS_TITLE,
                    textContent: translation.en.CONNECTIONS_TEXT_CONTENT,
                  }}
                />
                {!isOlderVersion && (
                  <>
                    <Block
                      title="From"
                      value={networkData?.details.traffic.from}
                      info={{
                        title: translation.en.FROM_TITLE,
                        textContent: translation.en.FROM_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Total read"
                      value={networkData?.details.traffic.totalread}
                      info={{
                        title: translation.en.TOTAL_READ_TITLE,
                        textContent: translation.en.TOTAL_READ_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Total write"
                      value={networkData?.details.traffic.totalwrite}
                      info={{
                        title: translation.en.TOTAL_WRITE_TITLE,
                        textContent: translation.en.TOTAL_WRITE_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Read"
                      value={networkData?.details.traffic.read}
                      info={{
                        title: translation.en.READ_TITLE,
                        textContent: translation.en.READ_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Write"
                      value={networkData?.details.traffic.write}
                      info={{
                        title: translation.en.WRITE_TITLE,
                        textContent: translation.en.WRITE_TEXT_CONTENT,
                      }}
                    />
                  </>
                )}
                {isOlderVersion && (
                  <>
                    <Block
                      title="From"
                      value={statusData.network.traffic.from}
                      info={{
                        title: translation.en.FROM_TITLE,
                        textContent: translation.en.FROM_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Total read"
                      value={statusData.network.traffic.totalread}
                      info={{
                        title: translation.en.TOTAL_READ_TITLE,
                        textContent: translation.en.TOTAL_READ_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Total write"
                      value={statusData.network.traffic.totalwrite}
                      info={{
                        title: translation.en.TOTAL_WRITE_TITLE,
                        textContent: translation.en.TOTAL_WRITE_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Read"
                      value={statusData.network.traffic.read}
                      info={{
                        title: translation.en.READ_TITLE,
                        textContent: translation.en.READ_TEXT_CONTENT,
                      }}
                    />
                    <Block
                      title="Write"
                      value={statusData.network.traffic.write}
                      info={{
                        title: translation.en.WRITE_TITLE,
                        textContent: translation.en.WRITE_TEXT_CONTENT,
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 mb-6">
            <MenuItem title="Full node status" onClick={displayFullStatus} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
