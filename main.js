"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

class Json2object extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "json2object",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.listOfNodes = [];
		this.listOfSubscribtions = [];
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.log.debug("loading config ...");
		this.log.debug(`subscribe to ${this.config.enWriteBack}`);
		this.unsubscribeForeignStates("*");
		// read input keys and subscribe
		this.config.inputKeys?.forEach((value) => {
			this.log.debug(value.name);
			if (value.name) {
				this.listOfNodes.push(value.name);
				this.log.debug(`subscribe to ${value.name}`);
				this.subscribeForeignStates(value.name);
				this.getForeignState(value.name, (err, state) => {
					if (err) {
						this.log.warn("error getting state");
					} else {
						this.log.debug("get state: " + state?.val);
						if (state?.val) {
							this.initObjectPath(value.name);
							this.createObjectAndState(value.name, String(state.val), this.config.enWriteBack);
						}
					}
				});
			}
		});
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.debug("unload adapter...");
			callback();
		} catch (e) {
			callback();
		}
	}

	convertType(val) {
		this.log.debug("type of " + typeof val);
		switch (typeof val) {
			case "string":
				return "string";
			case "bigint":
			case "number":
				return "number";
			case "boolean":
				return "boolean";
			case "array":
				return "array";
			case "object":
				return "object";
			case "file":
				return "file";
			default:
				return "mixed";
		}
	}
	/**
	 * Is called to initialize the objects for id
	 */
	initObjectPath(id) {
		const prefix = `${this.name}.0.`;
		let currentPath = "";
		for (const part of id.split(".")) {
			const objectType = currentPath ? "channel" : "device";
			currentPath = currentPath ? currentPath + "." + part : part;

			this.log.debug(`init object for: ` + currentPath + " with type: " + objectType);
			this.setObject(prefix + currentPath, {
				type: objectType,
				common: {
					name: part,
					role: "",
				},
				native: {},
			});
		}
	}
  /**
   * Is called to create object and set the state
   * @param {string} id
   * @param {string|object} val
   * @param {boolean} subscribe
   */
  createObjectAndState(id, val, subscribe) {
    let obj;
    if (typeof val === "string") {
      try {
        obj = JSON.parse(val);
      } catch (e) {
        this.log.warn(`invalid json format on: ${id} detected: ` + val);
        return;
      }
    } else {
      obj = val;
    }

    for (const [key, value] of Object.entries(obj)) {
      const completeKey = `${this.name}.0.` + id + "." + key;
      const fullKey = id + "." + key;

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        // → Rekursiv tiefer gehen für verschachtelte Objekte
        this.log.debug(`recursing into object: ${fullKey}`);
        this.setObject(
          completeKey,
          {
            type: "channel",
            common: {
              name: key,
              role: "folder",
            },
            native: {},
          },
          () => {
            this.createObjectAndState(fullKey, value, subscribe);
          },
        );
      } else {
        // → einfacher Wert: State anlegen
        this.log.debug(`create state: ${fullKey} = ${value}`);
        this.setObject(
          completeKey,
          {
            type: "state",
            common: {
              name: key,
              role: "state",
              read: true,
              write: true,
              type: this.convertType(value),
            },
            native: {},
          },
          () => {
            this.setState(fullKey, {
              val: value,
              ack: true,
            });
            if (subscribe && !this.listOfSubscribtions.includes(fullKey)) {
              this.log.debug(`subscribe for: ` + fullKey);
              this.subscribeStates(fullKey);
              this.listOfSubscribtions.push(fullKey);
            }
          },
        );
      }
    }
  }
	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			const device = id.split(".").pop();
			this.log.debug(`device: ${device}`);
			if (this.listOfNodes?.includes(id) && state?.val) {
				this.createObjectAndState(id, String(state.val), this.config.enWriteBack);
			} else {
				/* if ack is true, the change cames from our self */
				if (state.ack) {
					return;
				}
				const jsonKey = id.split(".").pop();
				let foreignKey = id.replace(`${this.name}.0.`, "").replace("." + jsonKey, "");
				this.log.debug(`foreignKey: ${foreignKey}, jsonKey: ${jsonKey}, value: ${state.val}`);
				const obj = {
					[String(jsonKey)]: state.val,
				};
				this.log.debug(`create and set object for: ${JSON.stringify(obj)} with key ${foreignKey}`);
				if (this.config.outSuffix) {
					foreignKey = foreignKey + "." + this.config.outSuffix;
					this.setForeignObject(
						foreignKey,
						{
							type: "state",
							common: {
								name: this.config.outSuffix,
								type: "string",
								role: "state",
								read: true,
								write: true,
							},
							native: {},
						},
						() => this.setForeignState(foreignKey, { val: JSON.stringify(obj), ack: false }),
					);
				} else {
					this.setForeignState(foreignKey, { val: JSON.stringify(obj), ack: false });
				}
			}
		} else {
			this.log.debug(`state ${id} deleted`);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Json2object(options);
} else {
	// otherwise start the instance directly
	new Json2object();
}
