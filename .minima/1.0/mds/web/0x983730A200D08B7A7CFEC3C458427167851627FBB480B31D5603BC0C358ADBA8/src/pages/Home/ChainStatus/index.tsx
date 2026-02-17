import { useContext, useEffect } from 'react';
import { appContext } from '../../../AppContext';
import Back from '../../../components/UI/Back';
import NodeStatus from '../../../components/NodeStatus';
import SlideScreen from '../../../components/UI/SlideScreen';

type FullStatusProps = {
  display: boolean;
  dismiss: () => void;
};

function ChainStatus({ display, dismiss }: FullStatusProps) {
  const { statusData } = useContext(appContext);

  useEffect(() => {
    document.body.style.overflow = display ? 'hidden' : 'unset';
  }, [display]);

  return (
    <SlideScreen display={display}>
      <div className="h-full flex flex-col p-5">
        {statusData && (
          <>
            <Back textContent="Back" onClick={dismiss} />
            <h1 className="text-2xl mb-6">Chain status</h1>

            <div className="mb-5">
              <NodeStatus />
            </div>

            <div className="flex-grow flex flex-col gap-6">
              <div className="rounded p-4 core-black-contrast-2 mb-5">
                <div className="mb-4">Help</div>
                <div className="text-sm text-core-grey-40">
                  <p className="mb-4">If your node is not in sync with the latest block, follow the steps below:</p>
                  <p className="mb-4">
                    If you have just restarted your node, please allow 10-15 minutes for your node to sync to the latest
                    block.
                  </p>
                  <p className="mb-4">If your node remains out of sync, please attempt the following steps:</p>
                  <ol className="list-decimal mx-4 mb-4">
                    <li className="mb-1">Check your internet connection</li>
                    <li className="mb-1">
                      Check that the Minima app battery setting is set to "not optimised" (if using Android)
                    </li>{' '}
                    <li className="mb-1">
                      Restart your node - in the majority of cases your node will successfully sync to the latest block. To restart your node, select Shutdown node from Settings. Please allow 10-15 minutes for your
                      node to sync after a restart.
                    </li>
                    <li className="mb-1">
                      Restore a backup - Ensure you have a copy of your seed phrase, then restore a backup using the Security MiniDapp to sync to the top block. Once in sync, take a new backup.
                    </li>
                    <li className="mb-1">
                      Chain re-sync - Ensure you have a copy of your seed phrase, then perform a chain re-sync using the Security MiniDapp. Once in sync, take a new backup.
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </SlideScreen>
  );
}

export default ChainStatus;
