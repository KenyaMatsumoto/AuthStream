package auth0

import (
	"context"
	"net/http"

	jwtmiddleware "github.com/auth0/go-jwt-middleware"
	"github.com/form3tech-oss/jwt-go"
)

// jwtmiddleware.JWTMiddlewareをContextに格納するためのキー
type JWTMiddlewareKey struct{}

// JWTをContextに保存するためのキー
type JWTKey struct{}

// jwtmiddleware.JWTMiddlewareをリクエストのContextに格納するためのMiddleware
func WithJWTMiddleware(m *jwtmiddleware.JWTMiddleware) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// リクエストのContextにJWTMiddlewareを格納する
			ctx := context.WithValue(r.Context(), JWTMiddlewareKey{}, m)
			// 新しいContextを入れて次の処理に渡す
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// JWT検証を行うためのmiddleware
func UseJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ContextからJWTMiddlewareを取得
		jwtm := r.Context().Value(JWTMiddlewareKey{}).(*jwtmiddleware.JWTMiddleware)
		// リクエスト中のJWTを検証
		if err := jwtm.CheckJWT(w, r); err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		// JWT検証後に、Contextのjwtm.Options.UserPropertyからパース済みのトークンを取得する
		if val := r.Context().Value(jwtm.Options.UserProperty); val != nil {
			token, ok := val.(*jwt.Token)
			if ok {
				// リクエストのContextにJWTを保存する
				ctx := context.WithValue(r.Context(), JWTKey{}, token)
				// 新しいContextを入れて次の処理に渡す
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// Contextに埋め込まれたJWTを取得する
func GetJWT(ctx context.Context) *jwt.Token {
	rawJWT, ok := ctx.Value(JWTKey{}).(*jwt.Token)
	if !ok {
		return nil
	}
	return rawJWT
}
