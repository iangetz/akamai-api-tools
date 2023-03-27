const EdgeGrid = require('akamai-edgegrid');
const logger = require('../logger');

/*
	Sample request:
	const res = await apiTools.getReportData({
		path: '/reporting-api/v1/reports/opresponses-by-time/versions/2/report-data',
		method: 'POST',
		accountSwitchKey: account.accountSwitchKey,
		body: {
			"objectIds": [`${cpcode}`],
			"metrics": ["avgResponseTime"]
		},
		logger: 'opresponses-by-time (CP code 112233)',
		dataProperty: 'data',
		headers: {header1: 'Header 1', header2: 'Header 2'}                           -> Optional
		startDate: startDateFormatted,                                                -> Optional
		endDate: endDateFormatted,                                                    -> Optional
		interval: 'HOUR',                                                             -> Optional
		groupId: grp_215885,                                                          -> Optional
		contractId: ctr_V-3UY193L,                                                    -> Optional
		arrayToObject: false,                                                         -> Optional
		objectKey: 'cpcode'                                                           -> Required if arrayToObject is true
	});
*/

class ApiTools {
	constructor(dotEdgerc) {
		this.dotEdgerc = dotEdgerc;
	}

	// Standard method to return length for either array or object
	getLength(input) {
		const realType = Object.prototype.toString
			.call(input)
			.slice(8, -1)
			.toLowerCase();

		switch(realType) {
			case 'array':
				return input.length;
			case 'object':
				return Object.keys(input).length;
			default:
				return undefined;
		}
	}

	getReportDates(weeksBack = 0, duration = 1) {
		let endDate = new Date();

		// Control history offset for initial Google Sheets setup (see config file)
		if(weeksBack > 0) {
			endDate.setUTCDate(endDate.getUTCDate() - (weeksBack * 7));
		}

		// Report is run each Monday morning for the prior week ending last Friday (reporting data for prior two days is not final)
		// Move to prior week if current date is not between Mon - Thu
		if(endDate.getUTCDay() < 1 || endDate.getUTCDay() > 4) {
			endDate.setUTCDate(endDate.getUTCDate() - 7);
		}

		// Set endDate to midnight on last available Friday
		// 2 is determined by subtracting desired day (i.e. Friday = 5) from 7
		endDate.setUTCDate(endDate.getUTCDate() - (endDate.getUTCDay() + 2) % 7);
		endDate.setUTCHours(0,0,0,0);
		const endDateFormatted = `${endDate.toISOString().split('.')[0]}Z`;

		// startDate
		let startDate = new Date(endDate);
		startDate.setUTCDate(startDate.getUTCDate() - (7 * duration));
		startDate.setUTCHours(0,0,0,0);
		const startDateFormatted = `${startDate.toISOString().split('.')[0]}Z`;

		return [startDateFormatted, endDateFormatted, endDate];
	}

	// endDateStr (string): Date value formatted as "YYYY-MM-DD")
	// duration (integer): Number of weeks prior to endDate
	getOffcycleDates(endDateStr, duration = 2) {
		const [year, month, date] = endDateStr.split("-")
		const endDate = new Date(year, month-1, date);

		// End date formatted for Akamai {OPEN} API
		const endDateFormatted = `${endDate.toISOString().split('.')[0]}Z`;

		// Start date formatted for Akamai {OPEN} API
		let startDate = new Date(year, month-1, date);
		startDate.setUTCDate(startDate.getUTCDate() - (7 * duration));
		const startDateFormatted = `${startDate.toISOString().split('.')[0]}Z`;

		return [startDateFormatted, endDateFormatted, endDate];
	}

	// count (int): number of CP codes to return in array
	// measurement (string): hits|bytes
	// level (string): edge|origin
	// products [array of strings]: ['Ion Standard'] == 
	async getTopCpcodes(accountSwitchKey, startDateFormatted, endDateFormatted, count=10, measurement='hits', level='edge', products=[]) {
		// Determine what API to call
		let path, metric, logger;
		if(measurement === 'hits') {
			path = '/reporting-api/v1/reports/hits-by-cpcode/versions/1/report-data';
			metric = level === 'edge' ? 'edgeHits' : 'originHits';
			logger = 'Top hits-by-cpcode';
		}
		else if(measurement === 'bytes') {
			path = '/reporting-api/v1/reports/bytes-by-cpcode/versions/1/report-data';
			metric = level === 'edge' ? 'edgeBytes' : 'originBytes';
			logger = 'Top bytes-by-cpcode';
		} else {
			// Not an acceptable measurement value
			return [];
		}

		// Get CP code data for either hits or bytes
		const byCpcode = await this.getReportData({
			path: path,
			method: 'POST',
			accountSwitchKey: accountSwitchKey,
			startDate: startDateFormatted,
			endDate: endDateFormatted,
			interval: 'HOUR',
			body: {
				"objectIds": "all",
				"metrics": [metric]
			},
			logger: logger,
			dataProperty: 'data',
		});

		// Filter by product, if specified in params
		let productCpcodes;
		if(products.length > 0) {
			const cpcodeDetails = await this.getReportData({
				path: '/cprg/v1/cpcodes',
				method: 'GET',
				accountSwitchKey: accountSwitchKey,
				body: {},
				logger: 'CP code details',
				dataProperty: 'cpcodes',
				arrayToObject: true,
				objectKey: 'cpcodeId'
			});

			productCpcodes = byCpcode.filter(elem => {
				if(cpcodeDetails[elem.cpcode].products.length > 0 && products.includes(cpcodeDetails[elem.cpcode].products[0].productName)) {
					return true;
				}
			});
		} else {
			// No filter, include all CP codes
			productCpcodes = [...byCpcode];
		}

		let topCpcodes = [];
		if(productCpcodes.length > 0) {
			// Sort descending order, largest first
			productCpcodes.sort((a,b) => {
				return b[metric] - a[metric];
			});

			// Trim list
			if(productCpcodes.length > count) {
				productCpcodes.length = count;
			}

			topCpcodes = productCpcodes.map(elem => elem.cpcode);
		}

		return topCpcodes;
	}

	async makeApiCall(reqObj) {
		// Initiate Akamai Edgerc
		const edgerc = new EdgeGrid({
			path: this.dotEdgerc,
			section: 'default'
		});

		// Get report data
		return new Promise((resolve, reject) => {			
			edgerc.auth({
				path: reqObj.uri,
				method: reqObj.method,
				headers: reqObj.fullHeaders,
				body: reqObj.body
			}).send((error, response, body) => {
				let log = {}, data;
				if(typeof response != 'undefined' && response.status === 200) {
					// Get data from appropriate response property (varies by {OPEN} API)
					const res = reqObj.dataProperty
					.split('.')
					.reduce((obj, item) => {
						return obj && obj[item];
					}, JSON.parse(body));
					
					// Log stats
					log.responseCode = response.status;
					log.length = this.getLength(res);

					if('arrayToObject' in reqObj && reqObj.arrayToObject === true) {
						// Convert array of objects to object with named keys
						const initialValue = {};
						data = res.reduce((obj, item) => {
							return {
								...obj,
								[item[reqObj.objectKey]]: item,
							};
						}, initialValue);
					} else {
						data = res;
					}
				} else {
					log.responseCode = error.response.status;
				}
				resolve([log, data]);
			});
		});
	}

	async getReportData(reqObj) {
		// Build the actual URI used to make the API call based on provided values
		let uri = `${reqObj.path}?accountSwitchKey=${reqObj.accountSwitchKey}`;
		if('startDate' in reqObj) {uri += `&start=${encodeURIComponent(reqObj.startDate)}`;}
		if('endDate' in reqObj) {uri += `&end=${encodeURIComponent(reqObj.endDate)}`;}
		if('interval' in reqObj) {uri += `&interval=${reqObj.interval}`;}
		if('groupId' in reqObj) {uri += `&groupId=${reqObj.groupId}`;}
		if('contractId' in reqObj) {uri += `&contractId=${reqObj.contractId}`;}
		reqObj.uri = uri;

		// Headers
		reqObj.fullHeaders = {"Content-Type": "application/json"};
		if('headers' in reqObj) {Object.assign(reqObj.fullHeaders, reqObj.headers)}

		// The actual call to the Akamai {OPEN} API with logic if response status code is not 200
		let attempts = 0, retries = 10, log = {}, data;
		while(attempts < retries && log.responseCode !== 200) {
			attempts++;
			console.log(`Attempt #${attempts} for ${reqObj.path}`);
			// If response was not 200, then 'data' variable was never assigned and value is 'undefined'
			[log, data] = await this.makeApiCall(reqObj);

			if(log.responseCode !== 200) {
				console.log(`No luck (HTTP ${responseCode})`);

				if(attempts === retries) {
					log.err = (`${retries} attempts to Akamai {OPEN} API`);
					return [log, data];
				}

				// Despite not getting an HTTP 200 response, delete all object data in case something was assigned
				for (let member in data) delete data[member];
				// One day I'll delete these safety lines
				console.debug('Safety measure...');
				console.debug({data});

				// Wait for 5 seconds before starting next retry
				await new Promise(r => setTimeout(r, 5000));
			}
		}

		return [log, data];
	}
}

module.exports = ApiTools;