# Akamai API Tools

Library to facilitate using Akamai {OPEN} APIs

----

## Prerequisites:

Local .edgerc file with valid Akamai client API credentials ([Authenticate with EdgeGrid](https://techdocs.akamai.com/developer/docs/authenticate-with-edgegrid))

----

## Functions

### **getDatesRelative(endDateOffset = 0, daysPrior = 1, returnEndDateObj = false)**

&nbsp;

Returns formatted start/end timestamps for a range of days

#### Input
Parameter  | Type | Description
------------- | ------------- | -------------
endDateOffset  | Int | Days prior to today for end date (e.g. 0 = through midnight today UTC)
daysPrior | Int | Number of days prior to endDate to include in report (e.g. 1 day, 5 days, etc.)
returnDateObj | Boolean | Include endDate Date object in response array

&nbsp;

#### Output (array)
Type  | Description
------------- | -------------
String  | Formatted timestamp for start of period
String | Formatted timestamp for end of period
Date object | Date object equivalent for end period

&nbsp;

### **getDatesToFriday(weeksBack = 0, weeks = 1, returnEndDateObj = false)**

&nbsp;

Custom use case: Report is run each week between Monday - Thursday morning for the prior week ending last Friday (a buffer since data for prior two days is not final)

#### Input
Parameter  | Type | Description
------------- | ------------- | -------------
weeksBack  | Int | Weeks prior to last week (0 = last week ending Friday)
weeks | Int | Number of weeks prior to endDate to include in report
returnDateObj | Boolean | Include endDate Date object in response array

&nbsp;

#### Output (array)
Type  | Description
------------- | -------------
String  | Formatted timestamp for start of period
String | Formatted timestamp for end of period
Date object | Date object equivalent for end period

&nbsp;

### **async getTopCpcodes(accountSwitchKey, startDateFormatted, endDateFormatted, count=10, measurement='hits', level='edge', products=[])**

&nbsp;

Returns the top CP codes by hits or bytes for a given time period

#### Input
Parameter  | Type | Description
------------- | ------------- | -------------
accountSwitchKey | String | Send empty '' value if not known which default to own account
startDateFormatted | String | Formatted Akamai API timestamp for start of reporting period
endDateFormatted | String | Formatted Akamai API timestamp for end of reporting period
count | Int | number of CP codes to return in array
measurement | String | 'hits' or 'bytes'
level | String | 'edge' or 'origin'
products | Array | Limit reporting data to specific products e.g. ['Ion Standard']

&nbsp;

#### Output (array)
Type  | Description
------------- | -------------
Object  | Log details from API request
Array | Array of top CP code IDs

&nbsp;

### **async getReportData(reqObj)**

&nbsp;

Get content from an Akamai {OPEN} API

### Input (object)
Object key  | Type | Description
------------- | ------------- | -------------
path | String | API endpoint path
method | String | GET or POST
accountSwitchKey | String | Ignore if not known (for Akamai employees)
body | Object | Varies by API, may be an empty but is required — see Tech Docs for details
dataProperty | String | JSON key within response to return (E.g. 'data')
params | String | Optional: List of additional URL parameters unique to a specific API
startDate | String | Required if needed by API -- see Tech Docs for details
endDate | String | Required if needed by API -- see Tech Docs for details
interval | String | Required if needed by API -- see Tech Docs for details
groupId | String | Required if needed by API -- see Tech Docs for details
contractId | String | Required if needed by API -- see Tech Docs for details
headers | String | Optional: Additional headers which can change response (E.g. 'PAPI-Use-Prefixes': false)
arrayToObject | Boolean | Optional: Return object instead of array
objectKey | String | Required if arrayToObject is true, specifies what value in each array to use as object key

&nbsp;

### Output (array)
Type  | Description
------------- | -------------
Object  | Log details from API request
Array or Object | API response, limited to the object property identified in 'dataProperty' request object

&nbsp;

Sample request for account CP codes (response: object)

	const cpcodeDetails = await apiTools.getReportData({
		path: '/cprg/v1/cpcodes',
		method: 'GET',
		accountSwitchKey: '',
		body: {},
		dataProperty: 'cpcodes',
		arrayToObject: true,
		objectKey: 'cpcodeId'
	});

Sample request for property (response: array)

	const propertyHostnames = await apiTools.getReportData({
		path: `/papi/v1/properties/${property.propertyId}/versions/${propertyVersion}/hostnames`,
		method: 'GET',
		headers: {'PAPI-Use-Prefixes': false},
		accountSwitchKey: '',
		groupId: property.groupId,
		contractId: property.contractId,
		body: {},
		dataProperty: 'hostnames.items'
	});

&nbsp;

### **getProductName(productId)**

&nbsp;

Convert [Property Mananger API](https://techdocs.akamai.com/property-mgr/reference/api) (PAPI) product ID to a human-friendly product name

### Input
Parameter  | Type | Description
------------- | ------------- | -------------
productId  | String | PAPI product ID (E.g. 'Fresca')

&nbsp;

### Output (array)
Type  | Description
------------- | -------------
String  | Human-friendly product name (E.g. 'Ion Standard')

&nbsp;

### **getLength(input)**

&nbsp;

Standard method to get length of variable which can be an string, array, or object

### Input
Parameter  | Type | Description
------------- | ------------- | -------------
input  | String, Array, or Object | Variable to determine length

&nbsp;

### Output (array)
Type  | Description
------------- | -------------
Int  | Legnth of string, number of array elements, or number of object keys

&nbsp;