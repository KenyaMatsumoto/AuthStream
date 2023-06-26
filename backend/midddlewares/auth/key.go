package auth0

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// JKWS向けの構造体定義
type JSONWebKeys struct {
	Kty string   `json:"kty"`
	Kid string   `json:"kid"`
	Use string   `json:"use"`
	N   string   `json:"n"`
	E   string   `json:"e"`
	X5c []string `json:"x5c"`
}

type JWKS struct {
	Keys []JSONWebKeys `json:"keys"`
}

func FetchJWKS(auth0Domain string) (*JWKS, error) {
	// ドメインを指定して公開鍵が入ったJWKSを取得する
	resp, err := http.Get(fmt.Sprintf("https://%s/.well-known/jwks.json", auth0Domain))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// 取得したJSONデータを構造体にマッピングする
	jwks := &JWKS{}
	err = json.NewDecoder(resp.Body).Decode(jwks)

	return jwks, err
}
