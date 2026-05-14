package service

import (
	"testing"
)

func TestHealthService_Live(t *testing.T) {
	// Live() does not use the pool; nil is fine for this unit test.
	svc := NewHealthService(nil)
	if svc == nil {
		t.Fatal("NewHealthService(nil) returned nil")
	}

	got := svc.Live()
	want := LiveStatus{Status: "ok"}
	if got != want {
		t.Errorf("Live() = %#v, want %#v", got, want)
	}
}

func TestHealthService_ReadyOK(t *testing.T) {
	svc := NewHealthService(nil)
	got := svc.ReadyOK()
	want := LiveStatus{Status: "ok"}
	if got != want {
		t.Errorf("ReadyOK() = %#v, want %#v", got, want)
	}
}
