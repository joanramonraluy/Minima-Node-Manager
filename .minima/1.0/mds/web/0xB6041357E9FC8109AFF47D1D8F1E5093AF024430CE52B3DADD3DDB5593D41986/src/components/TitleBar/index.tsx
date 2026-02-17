import useAndroidShowTitleBar from "../../hooks/useAndroidShowTitleBar";

const TitleBar = () => {
  const openTitleBar = useAndroidShowTitleBar();

  return (
    <div className="title-bar" onClick={openTitleBar}>
      <div className="title-bar__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 24V0H12L24 12V24H0Z" fill="white"/>
        </svg>
      </div>
      <h1 className="title-bar__title">Filez</h1>
    </div>
  );
};

export default TitleBar;

