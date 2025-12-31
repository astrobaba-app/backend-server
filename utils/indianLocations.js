// Indian States and their major cities
const INDIAN_STATES = {
  "Andhra Pradesh": [
    "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry", 
    "Tirupati", "Kadapa", "Kakinada", "Anantapur", "Eluru", "Ongole"
  ],
  "Arunachal Pradesh": [
    "Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro", "Bomdila", "Tezu"
  ],
  "Assam": [
    "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", 
    "Tezpur", "Bongaigaon", "Dhubri", "Karimganj"
  ],
  "Bihar": [
    "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", 
    "Bihar Sharif", "Arrah", "Begusarai", "Katihar", "Munger", "Chhapra"
  ],
  "Chhattisgarh": [
    "Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", 
    "Raigarh", "Jagdalpur", "Ambikapur"
  ],
  "Goa": [
    "Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim"
  ],
  "Gujarat": [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", 
    "Junagadh", "Gandhinagar", "Anand", "Navsari", "Morbi", "Nadiad", 
    "Surendranagar", "Bharuch", "Mehsana", "Gandhidham", "Vapi"
  ],
  "Haryana": [
    "Faridabad", "Gurgaon", "Hisar", "Rohtak", "Panipat", "Karnal", 
    "Sonipat", "Yamunanagar", "Panchkula", "Bhiwani", "Ambala", "Rewari"
  ],
  "Himachal Pradesh": [
    "Shimla", "Mandi", "Solan", "Dharamshala", "Palampur", "Kullu", 
    "Hamirpur", "Una", "Bilaspur", "Chamba", "Kangra"
  ],
  "Jharkhand": [
    "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh", 
    "Giridih", "Ramgarh", "Medininagar", "Chirkunda"
  ],
  "Karnataka": [
    "Bangalore", "Mysore", "Hubli", "Mangalore", "Belgaum", "Gulbarga", 
    "Davanagere", "Bellary", "Bijapur", "Shimoga", "Tumkur", "Raichur", 
    "Bidar", "Hospet", "Hassan", "Gadag", "Udupi", "Manipal"
  ],
  "Kerala": [
    "Thiruvananthapuram", "Kochi", "Kozhikode", "Kollam", "Thrissur", 
    "Palakkad", "Alappuzha", "Malappuram", "Kannur", "Kottayam", 
    "Kasaragod", "Pathanamthitta"
  ],
  "Madhya Pradesh": [
    "Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", 
    "Dewas", "Satna", "Ratlam", "Rewa", "Murwara", "Singrauli", 
    "Burhanpur", "Khandwa", "Morena", "Bhind"
  ],
  "Maharashtra": [
    "Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad", 
    "Solapur", "Kolhapur", "Amravati", "Navi Mumbai", "Sangli", "Jalgaon", 
    "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur", "Parbhani", 
    "Ichalkaranji", "Jalna", "Nanded", "Satara"
  ],
  "Manipur": [
    "Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Ukhrul"
  ],
  "Meghalaya": [
    "Shillong", "Tura", "Nongstoin", "Jowai", "Baghmara"
  ],
  "Mizoram": [
    "Aizawl", "Lunglei", "Champhai", "Serchhip", "Kolasib"
  ],
  "Nagaland": [
    "Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Zunheboto"
  ],
  "Odisha": [
    "Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", 
    "Puri", "Balasore", "Bhadrak", "Baripada", "Jharsuguda"
  ],
  "Punjab": [
    "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", 
    "Pathankot", "Hoshiarpur", "Batala", "Moga", "Malerkotla", "Khanna", 
    "Phagwara", "Muktsar", "Firozpur"
  ],
  "Rajasthan": [
    "Jaipur", "Jodhpur", "Kota", "Bikaner", "Ajmer", "Udaipur", 
    "Bhilwara", "Alwar", "Bharatpur", "Pali", "Sikar", "Tonk", 
    "Kishangarh", "Beawar", "Hanumangarh"
  ],
  "Sikkim": [
    "Gangtok", "Namchi", "Geyzing", "Mangan", "Rangpo"
  ],
  "Tamil Nadu": [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", 
    "Tirunelveli", "Tiruppur", "Ranipet", "Nagercoil", "Thanjavur", 
    "Vellore", "Kancheepuram", "Erode", "Tiruvannamalai", "Pollachi", 
    "Rajapalayam", "Sivakasi", "Pudukkottai", "Neyveli", "Nagapattinam", 
    "Viluppuram", "Tiruvallur", "Cuddalore"
  ],
  "Telangana": [
    "Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", 
    "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Suryapet", 
    "Siddipet", "Miryalaguda", "Jagtial", "Mancherial"
  ],
  "Tripura": [
    "Agartala", "Dharmanagar", "Udaipur", "Kailashahar", "Belonia", "Khowai"
  ],
  "Uttar Pradesh": [
    "Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", 
    "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", 
    "Gorakhpur", "Noida", "Firozabad", "Jhansi", "Muzaffarnagar", 
    "Mathura", "Rampur", "Shahjahanpur", "Farrukhabad", "Mau", 
    "Hapur", "Ayodhya", "Etawah", "Mirzapur", "Bulandshahr", "Sambhal"
  ],
  "Uttarakhand": [
    "Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", 
    "Kashipur", "Rishikesh", "Nainital", "Pithoragarh", "Almora"
  ],
  "West Bengal": [
    "Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Malda", 
    "Kharagpur", "Haldia", "Raiganj", "Krishnanagar", "Nabadwip", 
    "Medinipur", "Jalpaiguri", "Balurghat", "Basirhat", "Bankura", 
    "Barasat", "Barrackpore", "Purulia"
  ],
  "Andaman and Nicobar Islands": [
    "Port Blair", "Diglipur", "Rangat", "Car Nicobar", "Mayabunder"
  ],
  "Chandigarh": ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": [
    "Silvassa", "Daman", "Diu"
  ],
  "Delhi": [
    "New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi", 
    "Central Delhi", "North East Delhi", "North West Delhi", "South East Delhi", 
    "South West Delhi", "Shahdara"
  ],
  "Jammu and Kashmir": [
    "Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Udhampur", 
    "Kathua", "Rajouri", "Punch"
  ],
  "Ladakh": ["Leh", "Kargil", "Nubra", "Zanskar"],
  "Lakshadweep": ["Kavaratti", "Agatti", "Minicoy"],
  "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"]
};

// Get all states
const getAllStates = () => {
  return Object.keys(INDIAN_STATES).sort();
};

// Get cities by state
const getCitiesByState = (state) => {
  return INDIAN_STATES[state] || [];
};

// Validate Indian pincode (6 digits)
const validatePincode = (pincode) => {
  const pincodeRegex = /^[1-9][0-9]{5}$/;
  return pincodeRegex.test(pincode);
};

// Validate if state exists
const isValidState = (state) => {
  return INDIAN_STATES.hasOwnProperty(state);
};

// Validate if city exists in the given state
const isValidCity = (state, city) => {
  const cities = INDIAN_STATES[state];
  if (!cities) return false;
  return cities.some(c => c.toLowerCase() === city.toLowerCase());
};

module.exports = {
  INDIAN_STATES,
  getAllStates,
  getCitiesByState,
  validatePincode,
  isValidState,
  isValidCity,
};
