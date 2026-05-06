module github.com/paca/first-party/checklist

go 1.24

require github.com/paca/plugin-sdk v0.0.0

require github.com/google/uuid v1.6.0

replace github.com/paca/plugin-sdk => ../../../../plugins/sdk/backend
