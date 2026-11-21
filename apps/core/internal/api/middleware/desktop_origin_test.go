package middleware

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"testing"
)

func TestDesktopOriginProtectsServiceFromWebsitesAndRebinding(t *testing.T) {
	router := gin.New()
	router.Use(DesktopOrigin())
	router.Any("/config", func(c *gin.Context) { c.Status(200) })
	for _, origin := range []string{"", "mediago-community://index.html", "http://127.0.0.1:39719", "http://localhost:8555", "chrome-extension://installed-extension"} {
		req := httptest.NewRequest("POST", "http://127.0.0.1:39719/config", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("trusted origin %q rejected: %d", origin, w.Code)
		}
	}
	for _, origin := range []string{"null", "https://www.douyin.com", "https://example.invalid", "mediago-community://evil", "http://127.0.0.1.evil:39719"} {
		req := httptest.NewRequest("POST", "http://127.0.0.1:39719/config", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != 403 {
			t.Fatalf("external origin accepted: %q", origin)
		}
	}
	req := httptest.NewRequest("GET", "http://attacker.invalid:39719/config", nil)
	req.Header.Set("Origin", "http://attacker.invalid:39719")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatal("DNS-rebinding Host accepted")
	}
}
