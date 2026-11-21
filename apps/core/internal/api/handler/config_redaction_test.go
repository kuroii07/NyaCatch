package handler

import (
	"caorushizi.cn/mediago/internal/api/sse"
	"caorushizi.cn/mediago/internal/logger"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
	"net/http/httptest"
	"strings"
	"testing"
)

type redactionStore struct{ fail bool }

func (s *redactionStore) Get(string) any { return nil }
func (s *redactionStore) Set(string, any) error {
	if s.fail {
		return errors.New("synthetic-secret in IO error")
	}
	return nil
}
func (s *redactionStore) Update(map[string]any) error { return s.Set("", nil) }
func (s *redactionStore) Store() any                  { return map[string]any{"apiKey": "", "proxy": ""} }
func TestConfigLogsNeverContainRequestValuesOrArbitraryKeys(t *testing.T) {
	core, logs := observer.New(zap.DebugLevel)
	old, oldSugar := logger.Logger, logger.Sugar
	logger.Logger = zap.New(core)
	logger.Sugar = logger.Logger.Sugar()
	defer func() { logger.Logger = old; logger.Sugar = oldSugar }()
	for _, fail := range []bool{false, true} {
		store := &redactionStore{fail: fail}
		h := NewConfigHandler(store, sse.New())
		router := gin.New()
		router.POST("/config", h.Update)
		router.PUT("/config/:key", h.SetKey)
		cases := []struct{ method, path, body string }{{"POST", "/config", `{"apiKey":"synthetic-secret","proxy":"http://user:synthetic-password@localhost:8080","synthetic-key-secret":"value"}`}, {"PUT", "/config/synthetic-key-secret", `{"value":"synthetic-secret"}`}, {"POST", "/config", `{"synthetic-secret":`}}
		for _, row := range cases {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(row.method, row.path, strings.NewReader(row.body))
			req.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(w, req)
			if row.body[len(row.body)-1] == '}' && ((fail && w.Code != 500) || (!fail && w.Code != 200)) {
				t.Fatalf("status %d", w.Code)
			}
		}
	}
	for _, entry := range logs.All() {
		data, _ := json.Marshal(entry.ContextMap())
		text := entry.Message + string(data)
		for _, secret := range []string{"synthetic-secret", "synthetic-password", "synthetic-key-secret"} {
			if strings.Contains(text, secret) {
				t.Fatal("secret leaked to logs")
			}
		}
	}
	if logs.Len() == 0 {
		t.Fatal("no logs captured")
	}
}
