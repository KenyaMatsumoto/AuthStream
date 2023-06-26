package auth0

import (
	"errors"
	"fmt"
	"net/http"

	jwtmiddleware "github.com/auth0/go-jwt-middleware"
	"github.com/form3tech-oss/jwt-go"
)

func NewMiddleware(domain, clientID string, jwks *JWKS) (*jwtmiddleware.JWTMiddleware, error) {
	return jwtmiddleware.New(jwtmiddleware.Options{
		ValidationKeyGetter: newValidationKeyGetter(domain, clientID, jwks),
		// JWTで使われている署名アルゴリズムを指定する
		SigningMethod: jwt.SigningMethodRS256,
		ErrorHandler:  func(w http.ResponseWriter, r *http.Request, err string) {},
	}), nil
}

func newValidationKeyGetter(domain, clientID string, jwks *JWKS) func(*jwt.Token) (interface{}, error) {
	return func(token *jwt.Token) (interface{}, error) {
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return token, errors.New("invalid claims type")
		}

		// azpフィールドを見て、適切なClientIDのJWTかチェックする
		azp, ok := claims["azp"].(string)
		if !ok {
			return nil, errors.New("authorized parties are required")
		}
		if azp != clientID {
			return nil, errors.New("invalid authorized parties")
		}

		// issフィールドを見て、正しいトークン発行者か確認する
		iss := fmt.Sprintf("https://%s/", domain)
		ok = token.Claims.(jwt.MapClaims).VerifyIssuer(iss, true)
		if !ok {
			return nil, errors.New("invalid issuer")
		}

		// JWTの検証に必要な鍵を生成する
		cert, err := getPemCert(jwks, token)
		if err != nil {
			return nil, err
		}

		return jwt.ParseRSAPublicKeyFromPEM([]byte(cert))
	}
}

// JWKSからJWTで使われているキーをPEM形式で返す
func getPemCert(jwks *JWKS, token *jwt.Token) (string, error) {
	cert := ""

	for k := range jwks.Keys {
		if token.Header["kid"] == jwks.Keys[k].Kid {
			cert = "-----BEGIN CERTIFICATE-----\n" + jwks.Keys[k].X5c[0] + "\n-----END CERTIFICATE-----"
		}
	}

	if cert == "" {
		return "", errors.New("unable to find appropriate key")
	}

	return cert, nil
}
