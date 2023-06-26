package v1

import (
	"net/http"
)

func HandleIndex(w http.ResponseWriter, r *http.Request) {
	// "Hello!" とだけ返します
	w.Write([]byte("Hello!"))
}
