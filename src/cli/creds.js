"use strict";
/** @namespace Creds **/


/**
 * @typedef {Object} CredsListItem
 * @property {String} name
 * @property {String} hostname
 * @property {String} level
 * @property {String} parent
 */

/**
 * @typedef {Object} CertListItem
 * @property {String} level
 * @property {String} hostname
 * @property {String} print
 * @property {String} serial
 */

const Table = require('cli-table2');

require('../../initWin');

const config            = require('../../config/Config');
const module_name       = config.AppModules.BeameCreds;
const BeameLogger       = require('../utils/Logger');
const logger            = new BeameLogger(module_name);
const CommonUtils       = require('../utils/CommonUtils');


const path   = require('path');
const fs     = require('fs');

module.exports = {
	show,
	list,
	createWithToken,
	createWithLocalCreds,
	updateMetadata,
	shred,
	exportCredentials,
	importCredentials,
	importLiveCredentials
};

/**
 * XXX To be: "creds get --token"
 * @param {String} authToken
 * @param {String|null} [authSrvFqdn]
 * @param {String|null} [name]
 * @param {String|null} [email]
 * @param {Function} callback
 */
function createWithToken(authToken, authSrvFqdn, name, email, callback) {
	const store2 = new (require("../services/BeameStoreV2"))();

	let cred = new (require('../services/Credential'))(store2),
	    token = CommonUtils.parse(new Buffer(authToken, 'base64').toString());

	CommonUtils.promise2callback(cred.createEntityWithAuthServer(token, authSrvFqdn, name, email), callback);


}
createWithToken.toText = lineToText;

/**
 * XXX To be: "creds get --fqdn"
 * @param {String} parent_fqdn
 * @param {String|null} [name]
 * @param {String|null} [email]
 * @param {Function} callback
 */
function createWithLocalCreds(parent_fqdn, name, email, callback) {
	const store2 = new (require("../services/BeameStoreV2"))();

	let cred = new (require('../services/Credential'))(store2);

	CommonUtils.promise2callback(cred.createEntityWithLocalCreds(parent_fqdn, name, email), callback);

}
createWithLocalCreds.toText = lineToText;


function updateMetadata(fqdn, name, email, callback){
	const store2 = new (require("../services/BeameStoreV2"))();

	let cred = new (require('../services/Credential'))(store2);

	CommonUtils.promise2callback(cred.updateMetadata(fqdn, name, email), callback);
}
updateMetadata.toText = lineToText;

/** private helpers and services **/

/**
 * @private
 * @param line
 * @returns {*}
 */
function lineToText(line) {
	let table = new Table();
	for (let k in line) {
		//noinspection JSUnfilteredForInLoop
		table.push({[k]: line[k].toString()});
	}

	return table;
}

//noinspection JSUnusedLocalSymbols
/**
 * @private
 * @param line
 * @returns {string}
 */
function objectToText(line) {
	let line2 = {};
	Object.keys(line).forEach(k => {
		if (CommonUtils.isObject(line[k])) {
			//noinspection ES6ModulesDependencies,NodeModulesDependencies
			line2[k] = JSON.stringify(line[k]);
		}
		else {
			line2[k] = line[k].toString();
		}
	});

	return lineToText(line2);
}

/**
 * Return list of credentials
 * @private
 * @param {String|null} [fqdn] entity fqdn
 * @returns {Array<CredsListItem>}
 */
function listCreds(fqdn) {
	const store2 = new (require("../services/BeameStoreV2"))();
	return store2.list(fqdn);
}

/**
 * Return list of certificate properties
 * @public
 * @method Creds.show
 * @param {String|null} [fqdn] entity fqdn
 * @returns {Array.<CertListItem>}
 */
function show(fqdn) {
	const store2 = new (require("../services/BeameStoreV2"))();
	let creds    = store2.getCredential(fqdn);
	if (!creds) {
		throw new Error(`show: fqdn ${fqdn} was not found`);
	}
	return creds.metadata;
}

show.toText = lineToText;

/**
 * Return list of credentials
 * @public
 * @method Creds.list
 * @param {String|null} [regex] entity fqdn
 * @returns {Array.<CredsListItem>}
 */
function list(regex) {
	logger.debug(`list  ${regex}`);
	return listCreds(regex || '.');
}

list.toText = function (creds) {
	let table = new Table({
		head:      ['name', 'fqdn', 'parent', 'priv/k'],
		colWidths: [40, 65, 55, 10]
	});
	creds.forEach(item => {
		table.push([item.getMetadataKey("Name"), item.fqdn, item.getMetadataKey('PARENT_FQDN'), item.getKey('PRIVATE_KEY') ? 'Y' : 'N']);
	});
	return table;
};

function shred(fqdn) {
	const store2 = new (require("../services/BeameStoreV2"))();
	if (!fqdn) {
		logger.fatal("FQDN is required in shred");
	}
	store2.shredCredentials(fqdn, () => {
		return 'fqdn has been erased from store';
	});
}

shred.toText = lineToText;


/**
 * Export credentials from source fqdn to target fqdn
 * @public
 * @method Creds.exportCredentials
 * @param {String} fqdn - fqdn of credentials to export
 * @param {String} targetFqdn - fqdn of the entity to encrypt for
 * @param {String} signingFqdn
 * @param {String} file - path to file
 * @returns {String|null}
 */

function exportCredentials(fqdn, targetFqdn, signingFqdn, file) {
	const store2 = new (require("../services/BeameStoreV2"))();

	let creds = store2.getCredential(fqdn);
	if (creds && targetFqdn) {
		//noinspection ES6ModulesDependencies,NodeModulesDependencies
		let jsonCredentialObject = JSON.stringify(creds);
		if (!jsonCredentialObject) {
			logger.fatal(`Credentials for exporting ${fqdn} credentials are not found`);
		}

		let crypto = require('./crypto');
		let encryptedString;
		try {
			encryptedString = crypto.encrypt(jsonCredentialObject, targetFqdn, signingFqdn);
		} catch (e) {
			logger.error(`Could not encrypt with error `, e);
			return null;
		}

		if (!file) {
			//noinspection ES6ModulesDependencies,NodeModulesDependencies
			console.log(JSON.stringify(encryptedString));
		}
		else {
			let p = path.resolve(file);
			//noinspection ES6ModulesDependencies,NodeModulesDependencies
			fs.writeFileSync(p, JSON.stringify(encryptedString));
			return p;
		}
	}
}

/**
 * Import credentials exported with exportCredentials method
 * @public
 * @method Creds.importCredentials
 * @param {String|null} [file] - path to file with encrypted credentials
 * @returns {String}
 */
function importCredentials(file) {
	const store2 = new (require("../services/BeameStoreV2"))();
	//noinspection ES6ModulesDependencies,NodeModulesDependencies
	let data     = JSON.parse(fs.readFileSync(path.resolve(file)) + "");
	let crypto   = require('./crypto');
	let encryptedCredentials;

	if (data.signature) {
		let sigStatus = crypto.checkSignature(data.signedData, data.signedBy, data.signature);
		console.log(`Signature status is ${sigStatus}`);
		if (!sigStatus) {
			logger.fatal(`Import credentials signature missmatch ${data.signedBy}, ${data.signature}`);
		}
		encryptedCredentials = data.signedData;
	} else {
		encryptedCredentials = data;
	}
	//noinspection ES6ModulesDependencies,NodeModulesDependencies
	let decrtypedCreds = crypto.decrypt(JSON.stringify(encryptedCredentials));

	if (decrtypedCreds && decrtypedCreds.length) {
		//noinspection ES6ModulesDependencies,NodeModulesDependencies
		let parsedCreds = JSON.parse(decrtypedCreds);

		let importedCredential = new (require('../services/Credential.js'))(store2);
		importedCredential.initFromObject(parsedCreds);
		importedCredential.saveCredentialsObject();
		return `Successfully imported credentials ${importedCredential.fqdn}`;
	}
}

/**
 * XXX TODO: use URL not FQDN as parameter
 * Import non Beame credentials by fqdn and save to to ./beame/v{}/remote
 * @public
 * @method Creds.importNonBeameCredentials
 * @param {String} fqdn
 */
function importLiveCredentials(fqdn) {
	const store2 = new (require("../services/BeameStoreV2"))();
	let tls = require('tls');
	try {
		let ciphers           = tls.getCiphers().filter(cipher => {
			return cipher.indexOf('ec') < 0;

		});
		let allowedCiphers    = ciphers.join(':').toUpperCase();
		let conn              = tls.connect(443, fqdn, {host: fqdn, ciphers: allowedCiphers});
		let onSecureConnected = function () {
			//noinspection JSUnresolvedFunction
			let cert = conn.getPeerCertificate(true);
			conn.end();
			let bas64Str    = new Buffer(cert.raw, "hex").toString("base64");
			let certBody    = "-----BEGIN CERTIFICATE-----\r\n";
			certBody += bas64Str.match(/.{1,64}/g).join("\r\n") + "\r\n";
			certBody += "-----END CERTIFICATE-----";
			let credentials = store2.addToStore(certBody);
			credentials.saveCredentialsObject();
		};

		conn.on('error', function (error) {
			let msg = error && error.message || error.toString();
			logger.fatal(msg);
		});

		conn.once('secureConnect', onSecureConnected);

	}
	catch (e) {
		logger.fatal(e.toString());
	}

}
