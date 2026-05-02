import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import { useAuthStore } from "./stores/auth";
import { track, TRACK } from "./services/analytics";

import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    const { loadFromStorage, login } = useAuthStore.getState();
    loadFromStorage().then(() => {
      const { token } = useAuthStore.getState();
      if (!token) {
        login();
      } else {
        track(TRACK.APP_OPEN);
      }
    });
  });

  return children;
}

export default App;
