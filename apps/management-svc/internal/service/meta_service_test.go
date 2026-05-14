package service

import (
	"reflect"
	"testing"
)

func TestMetaService_RootInfo(t *testing.T) {
	svc := NewMetaService()
	if svc == nil {
		t.Fatal("NewMetaService() returned nil")
	}

	got := svc.RootInfo()
	want := RootInfo{
		Service: "management-svc",
		Endpoints: []string{
			"GET /health/live",
			"GET /health/ready",
		},
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("RootInfo() = %#v, want %#v", got, want)
	}
}
