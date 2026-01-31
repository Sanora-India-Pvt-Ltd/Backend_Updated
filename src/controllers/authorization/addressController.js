const addressService = require('../../app/services/address.service');

const createAddress = async (req, res) => {
  try {
    const result = await addressService.createAddress(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error creating address',
      error: err.message
    });
  }
};

const getAddresses = async (req, res) => {
  try {
    const result = await addressService.getAddresses(req.user._id);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving addresses',
      error: err.message
    });
  }
};

const getAddressById = async (req, res) => {
  try {
    const result = await addressService.getAddressById(req.user._id, req.params.addressId);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving address',
      error: err.message
    });
  }
};

const updateAddress = async (req, res) => {
  try {
    const result = await addressService.updateAddress(
      req.user._id,
      req.params.addressId,
      req.body
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error updating address',
      error: err.message
    });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const result = await addressService.deleteAddress(req.user._id, req.params.addressId);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error deleting address',
      error: err.message
    });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const result = await addressService.setDefaultAddress(req.user._id, req.params.addressId);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error setting default address',
      error: err.message
    });
  }
};

module.exports = {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};
