import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export const listUsers = (params) => apiGet('/users', params);
export const getUser = (id) => apiGet(`/users/${id}`);
export const createUser = (body) => apiPost('/users', body);
export const updateUser = (id, body) => apiPatch(`/users/${id}`, body);
export const deleteUser = (id) => apiDelete(`/users/${id}`);

export const listUserGroups = () => apiGet('/user-groups');
export const getUserGroup = (id) => apiGet(`/user-groups/${id}`);
export const createUserGroup = (body) => apiPost('/user-groups', body);
export const updateUserGroup = (id, body) => apiPatch(`/user-groups/${id}`, body);
export const deleteUserGroup = (id) => apiDelete(`/user-groups/${id}`);
