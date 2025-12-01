const {sequelize} = require("../dbConnection/dbConfig");
const User = require("../model/user/userAuth");
const UserRequest = require("../model/user/userRequest");
const Kundli = require("../model/horoscope/kundli");
const KundliMatch = require("../model/horoscope/kundliMatching");
const horoscope = require("../model/horoscope/horoscope");




const initDB = (callback) => {
  sequelize.authenticate()
    .then(() => {
      console.log('Connected to PostgreSQL');
      require('../model/associations/associations');
      return sequelize.sync(); // Creates tables if not exist {alter:true}
    })
    .then(() => {
      console.log('All models synced');
      callback(); 
    })
    .catch((error) => {
      console.error('Error connecting to the database:', error);
      process.exit(1);
    });
};
module.exports = initDB;