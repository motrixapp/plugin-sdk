{
  "manifestVersion": 1,
  "id": "{{PLUGIN_ID}}",
  "name": "%name%",
  "version": "0.1.0",
  "description": "%description%",
  "categories": ["post-action"],
  "engines": {
    "motrix": ">=2.0.0-beta.48 <3.0.0"
  },
  "main": "dist/plugin.js",
  "permissions": ["files.selected.read", "files.selected.write"],
  "activationEvents": ["onCommand:{{PLUGIN_ID}}.deduplicate"],
  "contributes": {
    "commands": [
      {
        "id": "{{PLUGIN_ID}}.deduplicate",
        "title": "%deduplicate%",
        "execution": "operation",
        "public": false,
        "argsSchema": {
          "type": "object",
          "properties": {
            "input": {
              "type": "string",
              "minLength": 36,
              "maxLength": 36
            },
            "output": {
              "type": "string",
              "minLength": 36,
              "maxLength": 36
            },
            "ignoreCase": {
              "type": "boolean",
              "default": false
            }
          },
          "required": ["input", "output", "ignoreCase"],
          "additionalProperties": false
        },
        "resultSchema": {
          "type": "object",
          "properties": {
            "output": {
              "type": "string",
              "minLength": 36,
              "maxLength": 36
            },
            "lines": {
              "type": "integer",
              "title": "%uniqueLines%",
              "minimum": 0,
              "maximum": 1048576
            }
          },
          "required": ["output", "lines"],
          "additionalProperties": false
        }
      }
    ],
    "operations": {
      "version": 1,
      "items": [
        {
          "id": "{{PLUGIN_ID}}.deduplicate",
          "title": "%deduplicate%",
          "description": "%operationDescription%",
          "icon": "document",
          "command": "{{PLUGIN_ID}}.deduplicate",
          "requires": ["operations.v1", "operations.ui.v1", "files.text.v1"],
          "fields": [
            {
              "field": "input",
              "label": "%input%",
              "appearance": {
                "icon": "document",
                "tone": "blue",
                "drop": true,
                "placeholder": "%inputPlaceholder%",
                "browseLabel": "%inputBrowse%"
              }
            },
            {
              "field": "ignoreCase",
              "label": "%ignoreCase%",
              "widget": "switch",
              "help": "%ignoreCaseHelp%"
            },
            {
              "field": "output",
              "label": "%output%",
              "appearance": {
                "icon": "folder",
                "tone": "amber",
                "placeholder": "%outputPlaceholder%",
                "browseLabel": "%outputBrowse%"
              }
            }
          ],
          "files": {
            "input": {
              "kind": "input-file",
              "use": "text",
              "extensions": ["txt"]
            },
            "output": {
              "kind": "output-file",
              "use": "text",
              "extensions": ["txt"],
              "suggestedName": {
                "stemFrom": "input",
                "suffix": "-unique"
              }
            }
          },
          "entries": [
            {
              "surface": "plugin-detail"
            },
            {
              "surface": "task-menu",
              "selection": {
                "count": {
                  "min": 1,
                  "max": 1
                },
                "every": {
                  "status": "completed",
                  "files": "single",
                  "local": true
                }
              },
              "bind": {
                "input": {
                  "source": "task-file",
                  "index": 0
                }
              }
            }
          ],
          "result": {
            "fields": ["lines"],
            "files": ["output"]
          },
          "ui": {
            "layout": {
              "type": "stack",
              "children": [
                {
                  "type": "field",
                  "field": "input"
                },
                {
                  "type": "group",
                  "title": "%matchingOptions%",
                  "children": [
                    {
                      "type": "field",
                      "field": "ignoreCase"
                    }
                  ],
                  "collapsible": true
                },
                {
                  "type": "field",
                  "field": "output"
                }
              ]
            },
            "submitLabel": "%submit%",
            "repeatLabel": "%repeat%",
            "footer": "%footer%",
            "repeat": "preserve-inputs"
          }
        }
      ]
    }
  },
  "l10n": "locales"
}
