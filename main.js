"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
// const fs = require("fs");

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
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.debug("config option1: " + this.config.inputKeys);
		this.log.debug("config option2: " + this.config.outSuffix);

		this.listOfNodes = this.config.inputKeys.split(",");

		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		for (const node of this.listOfNodes) {
			if (node) {
				this.log.debug(`subscripe to ${node}`);
				this.subscribeForeignStates(node);
				this.getForeignState(node, (err, state) => {
					if (err) {
						this.log.warn("error getting state");
					} else {
						this.log.debug("get state: " + state?.val);
						if (state?.val) {
							this.createObjectAndState(node, String(state.val));
						}
					}
				});
			}
		}
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		this.subscribeStates("*");

		/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		//	await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		//	await this.setStateAsync("testVariable", { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		//	await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		//	let result = await this.checkPasswordAsync("admin", "iobroker");
		//	this.log.info("check user admin pw iobroker: " + result);

		//	result = await this.checkGroupAsync("admin", "admin");
		//	this.log.info("check group user admin group admin: " + result);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/*'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'
	//  (err?: Error | null, obj?: { id: string })
	/**
	 * converts the value to the corresponding type
	 * @param {string | number | boolean | null} val
	 * @returns {'number' | 'string' | 'boolean' | 'array' | 'object' | 'mixed' | 'file'} the convertet value
	 */
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
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {string} val
	 */
	createObjectAndState(id, val) {
		let obj;
		try {
			obj = JSON.parse(val);
		} catch (e) {
			this.log.warn(`invalid json format on: ${id} detected`);
			return;
		}
		for (const [key, value] of Object.entries(obj)) {
			this.log.debug(`create object for: ` + key);
			this.setObjectNotExists(id + "." + key, {
				type: "state",
				common: {
					name: key,
					role: "state",
					read: true,
					write: true,
					type: this.convertType(value),
				},
				native: {},
			});
			this.log.debug(`set Object ${key} to: ${value}`);
			this.setState(id + "." + key, { val: value, ack: true });
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
			/*
			if (state.ack) {
				return;
			}
			*/
			const device = id.split(".").pop();
			this.log.debug(`device: ${device}`);
			if (this.listOfNodes?.includes(id) && state?.val) {
				this.createObjectAndState(id, String(state.val));
			} else {
				/* if ack is true, the change cames from our self */
				if (state.ack) {
					return;
				}
				const jsonKey = id.split(".").pop();
				let foreignKey = id.replace(`${this.name}.0.`, "").replace("." + jsonKey, "");
				this.log.info(`foreignKey: ${foreignKey}, jsonKey: ${jsonKey}, value: ${state.val}`);
				const obj = {
					[String(jsonKey)]: state.val,
				};
				this.log.info(`created object: ${JSON.stringify(obj)}`);
				if (this.config.outSuffix) {
					foreignKey = foreignKey + "." + this.config.outSuffix;
					this.setForeignObjectNotExists(foreignKey, {
						type: "state",
						common: {
							name: this.config.outSuffix,
							type: "string",
							role: "state",
							read: false,
							write: true,
						},
						native: {},
					});
				}
				this.setForeignState(foreignKey, { val: JSON.stringify(obj), ack: false });
			}
		} else {
			this.log.info(`state ${id} deleted`);
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
