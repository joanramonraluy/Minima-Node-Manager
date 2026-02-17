import { useContext } from "react";
import { appContext } from "./AppContext";
import Home from './pages/Home';
import Splash from './components/Splash';
import Titlebar from './components/TitleBar';

function App() {
  const { loaded } = useContext(appContext);

  if (!loaded) {
    return <div />;
  }

  return (
    <div>
      <Splash />
      <div className="flex flex-col min-h-screen">
        <Titlebar />
        <div className="mobile-container restriction grow">
          <Home />
        </div>
      </div>
    </div>
  );
}

export default App;
