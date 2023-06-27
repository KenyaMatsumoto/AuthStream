// client/src/App.js

import { useState, useEffect } from "react";
import "./App.css";
import { useAuth0 } from "@auth0/auth0-react";

const API_URL = "http://localhost:8000";

// Auth0のJWTを取得するフック
const useAuth0Token = () => {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    const fetchToken = async () => {
      // JWTを取得して状態に保存する
      setAccessToken(await getAccessTokenSilently());
    };

    // ログイン済みの場合のみJWTを取得する
    if (isAuthenticated) {
      fetchToken();
    }
  }, [isAuthenticated, user?.sub]);

  return accessToken;
};

function App() {
  const { loginWithRedirect, isAuthenticated } = useAuth0();
  const token = useAuth0Token();
  // ユーザー情報を保持する状態
  const [me, setMe] = useState(null);
  // APIコールのエラーを保持する状態
  const [error, setError] = useState(null);

  const onClickLogin = () => {
    loginWithRedirect();
  };

  const onClickCall = async () => {
    try {
      // APIを呼ぶ
      const res = await fetch(`${API_URL}/v1/users/me`, {
        method: "GET",
        mode: "cors",
        headers: {
          // JWTをAuthorizationヘッダにセットする
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      console.log("res", res);
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      const me = await res.json();
      setError(null);
      setMe(me);
    } catch (error) {
      console.log("error", error);
      setError(error);
    }
  };

  return (
    <div className="App">
      <div
        style={{ display: "flex", justifyContent: "center", marginTop: "64px" }}
      >
        <button onClick={onClickLogin} disabled={isAuthenticated}>
          {isAuthenticated ? "ログイン済み" : "ログイン"}
        </button>
      </div>
      <div
        style={{ display: "flex", justifyContent: "center", marginTop: "64px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginRight: "32px",
          }}
        >
          <button onClick={onClickCall}>ユーザー情報を取得</button>
        </div>
        <div style={{ width: "300px" }}>
          <p>ユーザー: {JSON.stringify(me)}</p>
          <p>エラー: {error ? error.toString() : ""}</p>
        </div>
      </div>
    </div>
  );
}

export default App;
