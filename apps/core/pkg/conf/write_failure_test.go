package conf

import (
	"bytes"
	"os"
	"reflect"
	"testing"
)

func TestWriteFailurePreservesMemoryDiskAndListeners(t *testing.T) {
	operations := map[string]func(*Conf[map[string]any]) error{
		"set": func(c *Conf[map[string]any]) error { return c.Set("nested.value", "new") },
		"update": func(c *Conf[map[string]any]) error {
			return c.Update(map[string]any{"name": "new", "nested.value": "new"})
		},
		"replace": func(c *Conf[map[string]any]) error {
			return c.SetStore(map[string]any{"name": "new", "nested": map[string]any{"value": "new"}})
		},
		"delete": func(c *Conf[map[string]any]) error { return c.Delete("nested.value") },
	}
	for name, operation := range operations {
		t.Run(name, func(t *testing.T) {
			c, err := New(Options[map[string]any]{CWD: t.TempDir(), Defaults: map[string]any{"name": "old", "nested": map[string]any{"value": "old"}}})
			if err != nil {
				t.Fatal(err)
			}
			before := c.Store()
			disk, err := os.ReadFile(c.Path())
			if err != nil {
				t.Fatal(err)
			}
			calls := 0
			c.OnDidChange("nested.value", func(any, any) { calls++ })
			blocker := c.Path() + ".tmp"
			if err := os.Mkdir(blocker, 0700); err != nil {
				t.Fatal(err)
			}
			if err := operation(c); err == nil {
				t.Fatal("expected disk write failure")
			}
			if !reflect.DeepEqual(c.Store(), before) || c.Get("nested.value") != "old" {
				t.Fatal("failed save mutated memory")
			}
			after, err := os.ReadFile(c.Path())
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(disk, after) {
				t.Fatal("failed save mutated file")
			}
			if calls != 0 {
				t.Fatal("failed save notified listeners")
			}
			if err := os.Remove(blocker); err != nil {
				t.Fatal(err)
			}
			if err := operation(c); err != nil {
				t.Fatalf("retry failed: %v", err)
			}
		})
	}
}
