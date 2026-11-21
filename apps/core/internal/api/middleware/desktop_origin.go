package middleware

import (
	"github.com/gin-gonic/gin"
	"net"
	"net/http"
	"net/url"
)

// CLI clients have no Origin. Browser requests must come from the app, its own
// player, the local development UI, or an explicitly installed browser extension.
func DesktopOrigin() gin.HandlerFunc {
	return func(c *gin.Context) {
		host, _, err := net.SplitHostPort(c.Request.Host)
		if err != nil {
			host = c.Request.Host
		}
		ip := net.ParseIP(host)
		if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}
		parsed, err := url.Parse(origin)
		valid := err == nil && parsed.User == nil && parsed.RawQuery == "" && parsed.Fragment == "" && (parsed.Path == "" || parsed.Path == "/")
		trusted := false
		if valid {
			trusted = (parsed.Scheme == "mediago-community" && parsed.Host == "index.html") ||
				(parsed.Scheme == "http" && parsed.Host == c.Request.Host) ||
				(parsed.Scheme == "http" && (parsed.Host == "localhost:8555" || parsed.Host == "127.0.0.1:8555")) ||
				((parsed.Scheme == "chrome-extension" || parsed.Scheme == "moz-extension") && parsed.Host != "")
		}
		if !trusted {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": 403, "message": "External website origins cannot access the desktop service"})
			return
		}
		c.Next()
	}
}
