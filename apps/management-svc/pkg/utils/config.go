package utils

import (
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// LoadAncestorDotEnv loads the first `.env` found walking up from the working directory
// (typically the monorepo root). Already-set environment variables are not overridden.
func LoadAncestorDotEnv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for {
		p := filepath.Join(dir, ".env")
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if err := godotenv.Load(p); err != nil {
				log.Fatalf("load %s: %v", p, err)
			}
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}
