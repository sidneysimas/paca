//go:build wasip1

package main

import plugin "github.com/paca/plugin-sdk"

func init() {
	plugin.Run(&checklistPlugin{})
}

func main() {}
