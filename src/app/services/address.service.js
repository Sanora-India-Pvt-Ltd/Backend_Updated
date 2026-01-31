/**
 * User addresses CRUD. Used by addressController.
 */

const mongoose = require('mongoose');
const Address = require('../../models/authorization/Address');

async function createAddress(userId, body) {
  const {
    label,
    fullName,
    phoneNumber,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    country,
    isDefault
  } = body || {};

  if (!label || !fullName || !phoneNumber || !addressLine1 || !city || !state || !zipCode) {
    return {
      statusCode: 400,
      json: {
        success: false,
        message:
          'Missing required fields: label, fullName, phoneNumber, addressLine1, city, state, zipCode are required'
      }
    };
  }

  if (isDefault === true) {
    await Address.updateMany({ userId, isDefault: true }, { isDefault: false });
  }

  const address = await Address.create({
    userId,
    label: label.trim(),
    fullName: fullName.trim(),
    phoneNumber: phoneNumber.trim(),
    addressLine1: addressLine1.trim(),
    addressLine2: addressLine2 ? addressLine2.trim() : '',
    city: city.trim(),
    state: state.trim(),
    zipCode: zipCode.trim(),
    country: country || 'India',
    isDefault: isDefault || false
  });

  return {
    statusCode: 201,
    json: { success: true, message: 'Address created successfully', data: { address } }
  };
}

async function getAddresses(userId) {
  const addresses = await Address.find({ userId })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Addresses retrieved successfully',
      data: { addresses }
    }
  };
}

async function getAddressById(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid address ID' } };
  }

  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { statusCode: 404, json: { success: false, message: 'Address not found' } };
  }

  return {
    statusCode: 200,
    json: { success: true, message: 'Address retrieved successfully', data: { address } }
  };
}

async function updateAddress(userId, addressId, body) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid address ID' } };
  }

  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { statusCode: 404, json: { success: false, message: 'Address not found' } };
  }

  const {
    label,
    fullName,
    phoneNumber,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    country,
    isDefault
  } = body || {};

  if (isDefault === true && !address.isDefault) {
    await Address.updateMany(
      { userId, isDefault: true, _id: { $ne: addressId } },
      { isDefault: false }
    );
  }

  if (label !== undefined) address.label = label.trim();
  if (fullName !== undefined) address.fullName = fullName.trim();
  if (phoneNumber !== undefined) address.phoneNumber = phoneNumber.trim();
  if (addressLine1 !== undefined) address.addressLine1 = addressLine1.trim();
  if (addressLine2 !== undefined) address.addressLine2 = addressLine2.trim();
  if (city !== undefined) address.city = city.trim();
  if (state !== undefined) address.state = state.trim();
  if (zipCode !== undefined) address.zipCode = zipCode.trim();
  if (country !== undefined) address.country = country.trim();
  if (isDefault !== undefined) address.isDefault = isDefault;

  await address.save();

  return {
    statusCode: 200,
    json: { success: true, message: 'Address updated successfully', data: { address } }
  };
}

async function deleteAddress(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid address ID' } };
  }

  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { statusCode: 404, json: { success: false, message: 'Address not found' } };
  }

  await Address.findByIdAndDelete(addressId);

  return {
    statusCode: 200,
    json: { success: true, message: 'Address deleted successfully' }
  };
}

async function setDefaultAddress(userId, addressId) {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid address ID' } };
  }

  const address = await Address.findOne({ _id: addressId, userId });
  if (!address) {
    return { statusCode: 404, json: { success: false, message: 'Address not found' } };
  }

  await Address.updateMany(
    { userId, isDefault: true, _id: { $ne: addressId } },
    { isDefault: false }
  );
  address.isDefault = true;
  await address.save();

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Default address updated successfully',
      data: { address }
    }
  };
}

module.exports = {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};
