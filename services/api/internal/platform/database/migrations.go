// Package database — migration runner.
package database

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"gorm.io/gorm"
)

// RunMigrations executes all *.sql files found in migrationsDir against db in
// lexicographic order.  Each file is run inside its own transaction; an error
// in any file halts the run.
func RunMigrations(db *gorm.DB, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("migrations: read dir %q: %w", migrationsDir, err)
	}

	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".sql" {
			continue
		}

		path := filepath.Join(migrationsDir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("migrations: read %q: %w", path, err)
		}

		if err := db.Exec(string(data)).Error; err != nil {
			return fmt.Errorf("migrations: exec %q: %w", path, err)
		}
	}

	return nil
}

// RunMigrationsFS executes all *.sql files found in the root of fsys (in
// lexicographic order) against db.  All SQL files must be idempotent
// (CREATE TABLE IF NOT EXISTS, INSERT … ON CONFLICT, etc.) so the function
// is safe to call on every startup in any environment.
func RunMigrationsFS(db *gorm.DB, fsys fs.FS) error {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return fmt.Errorf("migrations: read dir: %w", err)
	}

	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".sql" {
			continue
		}

		data, err := fs.ReadFile(fsys, e.Name())
		if err != nil {
			return fmt.Errorf("migrations: read %q: %w", e.Name(), err)
		}

		if err := db.Exec(string(data)).Error; err != nil {
			return fmt.Errorf("migrations: exec %q: %w", e.Name(), err)
		}
	}

	return nil
}
