package main

import (
	"fmt"
	"log"
	"net/http"

	v1 "github.com/Kourin1996/go-auth0-example/server/handlers/v1"
	"github.com/Kourin1996/go-auth0-example/server/handlers/v1/users/me"
	"github.com/Kourin1996/go-auth0-example/server/middlewares/auth0"
	"github.com/rs/cors"
)

const (
	port     = 8000
	domain   = "<AUTH0_DOMAIN>"
	clientID = "<AUTH0_CLIENT_ID>"
)

func main() {
	// 公開鍵を取得する
	jwks, err := auth0.FetchJWKS(domain)
	if err != nil {
		log.Fatal(err)
	}
	// domain, clientID, 公開鍵を元にJWTMiddlewareを作成する
	jwtMiddleware, err := auth0.NewMiddleware(domain, clientID, jwks)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	// /v1へのリクエストの場合のハンドラを登録
	mux.HandleFunc("/v1", v1.HandleIndex)
	// /v1/users/meへのリクエストの場合のハンドラを登録
	// auth0.UseJWTでラップし、ハンドラを呼ぶ前にJWT認証を行う
	mux.Handle("/v1/users/me", auth0.UseJWT(http.HandlerFunc(me.HandleIndex)))

	// フロントエンドからアクセスできるようにCORSの設定をする
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
		Debug:            true,
	})

	// リクエスト前にJWTMiddlewareをContextに埋め込むためのMiddlewareを追加
	wrappedMux := auth0.WithJWTMiddleware(jwtMiddleware)(mux)
	wrappedMux = c.Handler(wrappedMux)

	addr := fmt.Sprintf(":%d", port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, wrappedMux); err != nil {
		log.Fatal(err)
	}
}
