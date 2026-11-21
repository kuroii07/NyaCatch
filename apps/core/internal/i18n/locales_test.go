package i18n

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestFiveLocalesAndRegionalMatching(t *testing.T) {
	cases := map[string]string{"zh-CN": "zh", "zh-TW": "zh-TW", "zh-Hant": "zh-TW", "zh-HK": "zh-TW", "ja-JP": "ja", "ko-KR": "ko", "en-US": "en", "fr-FR": "en"}
	for input, want := range cases {
		if got := resolveCode(input); got != want {
			t.Fatalf("%s: got %s want %s", input, got, want)
		}
	}
	pattern := regexp.MustCompile(`%[sd]`)
	for lang, catalog := range catalogs {
		if len(catalog) != len(catalogs["en"]) {
			t.Fatalf("%s: missing keys", lang)
		}
		for key, original := range catalogs["en"] {
			value, ok := catalog[key]
			if !ok || value == "" {
				t.Fatalf("%s missing %s", lang, key)
			}
			if strings.Join(pattern.FindAllString(original, -1), ",") != strings.Join(pattern.FindAllString(value, -1), ",") {
				t.Fatalf("%s placeholders for %s", lang, key)
			}
		}
	}
}

func TestRequestLocaleOverridesStoredLanguage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Middleware(func() string { return "zh" }))
	router.GET("/", func(c *gin.Context) { c.String(200, TLang(Lang(c), MsgTaskNotFound)) })
	for _, locale := range []string{"zh-TW", "ja", "ko"} {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Accept-Language", locale)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Body.String() != TLang(locale, MsgTaskNotFound) {
			t.Fatalf("request language ignored for %s", locale)
		}
	}
}
