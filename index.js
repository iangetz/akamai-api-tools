const EdgeGrid = require('akamai-edgegrid');

class ApiTools {
	constructor(dotEdgerc) {
		this.dotEdgerc = dotEdgerc;
	}

	// endDateOffset (int): Days prior to today for end date (e.g. 0 = through midnight today UTC)
	// daysPrior (int): Number of days prior to endDate to include in report (e.g. 1 day, 5 days, etc.)
	// returnDateObj (Boolean): Include endDate Date object in response array
	getDatesRelative(endDateOffset = 0, daysPrior = 1, returnEndDateObj = false) {
		// New date 'endDateOffset' days ago
		const endDate = new Date();
		endDate.setUTCDate(endDate.getUTCDate() - endDateOffset);
		endDate.setUTCHours(0,0,0,0);

		// End date formatted for Akamai {OPEN} API
		const endDateFormatted = `${endDate.toISOString().split('.')[0]}Z`;

		// Start date formatted for Akamai {OPEN} API
		let startDate = new Date();
		startDate.setUTCDate(startDate.getUTCDate() - (endDateOffset + daysPrior));
		startDate.setUTCHours(0,0,0,0);
		const startDateFormatted = `${startDate.toISOString().split('.')[0]}Z`;

		if(returnEndDateObj) {
			return [startDateFormatted, endDateFormatted, endDate];
		} else {
			return [startDateFormatted, endDateFormatted];
		}
	}

	// Custom use case: Report is run each week between Monday - Thursday morning for the prior week ending last Friday (a buffer since data for prior two days is not final)
	// weeksBack (int): Weeks prior to last week (0 = last week ending Friday)
	// weeks (int): Number of weeks prior to endDate to include in report
	// returnDateObj (Boolean): Include endDate Date object in response array
	getDatesToFriday(weeksBack = 0, weeks = 1, returnEndDateObj = false) {
		let endDate = new Date();

		// Used if populating a new dashboard to capture weekly data from <weeksback> weeks ago
		if(weeksBack > 0) {
			endDate.setUTCDate(endDate.getUTCDate() - (weeksBack * 7));
		}

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
		startDate.setUTCDate(startDate.getUTCDate() - (7 * weeks));
		startDate.setUTCHours(0,0,0,0);
		const startDateFormatted = `${startDate.toISOString().split('.')[0]}Z`;

		if(returnEndDateObj) {
			return [startDateFormatted, endDateFormatted, endDate];
		} else {
			return [startDateFormatted, endDateFormatted];
		}
	}

	// accountSwitchKey (string): Send empty '' value if not known
	// startDateFormatted (string): Formatted Akamai API timestamp for start of reporting period
	// endDateFormatted (string): Formatted Akamai API timestamp for end of reporting period
	// count (int): number of CP codes to return in array
	// measurement (string): hits|bytes
	// level (string): edge|origin
	// products [array]: Limit reporting data to specific products e.g. ['Ion Standard']
	async getTopCpcodes(accountSwitchKey, startDateFormatted, endDateFormatted, count=10, measurement='hits', level='edge', products=[]) {
		// Determine what API to call
		let path, metric;
		if(measurement === 'hits') {
			path = '/reporting-api/v1/reports/hits-by-cpcode/versions/1/report-data';
			metric = level === 'edge' ? 'edgeHits' : 'originHits';
		}
		else if(measurement === 'bytes') {
			path = '/reporting-api/v1/reports/bytes-by-cpcode/versions/1/report-data';
			metric = level === 'edge' ? 'edgeBytes' : 'originBytes';
		} else {
			// Not an acceptable measurement value
			return [
				{
					responseCode: 400,
					error: 'Bad Request: Invalid measurement value',
					length: 0,
					timer: 0
				},
				[]
			];
		}

		// Get CP code data for either hits or bytes
		const [logHitByte, byCpcode] = await this.getReportData({
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
			dataProperty: 'data',
		});

		if(logHitByte.responseCode === 200) {
			// Filter by product, if specified in params
			let productCpcodes, logCp, cpcodeDetails;
			if(products.length > 0) {
				[logCp, cpcodeDetails] = await this.getReportData({
					path: '/cprg/v1/cpcodes',
					method: 'GET',
					accountSwitchKey: accountSwitchKey,
					body: {},
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

			if(typeof logCp === 'undefined') {
				return [logHitByte, topCpcodes];
			} else {
				logCp.timer = logHitByte.timer + logCp.timer;
				return [logCp, topCpcodes];
			}

		} else {
			return [logHitByte, []];
		}
	}

	/*
		Get CP code data for either hits or bytes

		Sample
		const res = await apiTools.getReportData({
			path: '/reporting-api/v1/reports/opresponses-by-time/versions/2/report-data',
			method: 'POST',
			accountSwitchKey: account.accountSwitchKey,				-> Ignore if not known (for Akamai employees)
			body: {													-> Body varies by API requirements
				"objectIds": ["123456"],
				"metrics": ["avgResponseTime"]
			},
			dataProperty: "data",
			params: "depth=ALL"										-> Optional
			startDate: startDateFormatted,							-> Optional
			endDate: endDateFormatted,								-> Optional
			interval: "HOUR",										-> Optional
			groupId: "grp_123456",									-> Optional
			contractId: "ctr_A-B0C1D2E",							-> Optional
			headers: {header1: "Header 1", header2: "Header 2"}		-> Optional
			arrayToObject: false,									-> Optional
			objectKey: "cpcode"										-> Required if arrayToObject is true
		});
	*/
	async getReportData(reqObj) {
		// Build URI used to make the API call
		let uri = `${reqObj.path}`;
		if('accountSwitchKey' in reqObj) {
			uri += `?accountSwitchKey=${reqObj.accountSwitchKey}`
		} else {
			uri += '?accountSwitchKey=';
		}
		if('params' in reqObj) {uri += `&params=${reqObj.params}`};
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

			// Make API call and capture response time
			const timerStart = new Date();
			[log, data] = await this.makeApiCall(reqObj);
			const timerStop = new Date();
			log.timer = Math.round(Math.abs(timerStop - timerStart));

			if(log.responseCode !== 200) {
				// If response was not 200, then 'data' variable was never assigned and value is 'undefined'
				console.log(`No luck (HTTP ${log.responseCode})`);

				if(attempts === retries) {
					log.error = (`${retries} unsuccessful attempts to Akamai {OPEN} API`);
					return [log, data];
				}

				// Wait for 5 seconds before starting next retry
				await new Promise(r => setTimeout(r, 5000));
			}
		}

		return [log, data];
	}

	// Internal function, called by getReportData(), that actually makes the API call
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
					// Get data from appropriate response property (varies by {OPEN} API), if specified
					let res;
					if('dataProperty' in reqObj) {
						res = reqObj.dataProperty
							.split('.')
							.reduce((obj, item) => {
								return obj && obj[item];
							}, JSON.parse(body));
					} else {
						res = JSON.parse(body);
					}

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

	// Convert product ID to a human-friendly product name
	getProductName(productId) {
		const papiProductKeys = {
			API_Accel: 'API Acceleration',
			Adaptive_Media_Delivery: 'Adaptive Media Delivery',
			Alta: 'Terra Alta Enterprise Accelerator',
			Aqua_Mobile: 'Aqua Mobile',
			DCP: 'IoT Edge Connect',
			Download_Delivery: 'Download Delivery',
			Dynamic_Site_Del: 'Dynamic Site Delivery',
			EdgeConnect: 'Cloud Monitor Data Delivery',
			Edge_Connect_Message_Store: 'Edge Connect Message Store',
			Fresca: 'Ion Standard',
			HTTP_Content_Del: 'HTTP Content Delivery',
			HTTP_Downloads: 'HTTP Downloads',
			IoT: 'IoT',
			Obj_Caching: 'Object Caching',
			Obj_Delivery: 'Object Delivery',
			Progressive_Media: 'Progressive Media Downloads',
			RM: 'Ion Media Advanced',
			Rich_Media_Accel: 'Rich Media Accelerator',
			SPM: 'Ion Premier',
			Security_Failover: 'Cloud Security Failover',
			Site_Accel: 'Dynamic Site Accelerator',
			Site_Defender: 'Kona Site Defender',
			Site_Del: 'Dynamic Site Delivery Legacy',
			WebAP: 'Web Application Protector',
			Web_App_Accel: 'Web Application Accelerator'
		};

		return papiProductKeys[productId];
	}

	// Internal standard method to return length for either array or object
	getLength(input) {
		const realType = Object.prototype.toString
			.call(input)
			.slice(8, -1)
			.toLowerCase();

		switch(realType) {
			case 'string':
			case 'array':
				return input.length;
			case 'object':
				return Object.keys(input).length;
			default:
				return undefined;
		}
	}
}

module.exports = ApiTools;