// ==========================================================
// BLOOD GROUP COMPATIBILITY (red cell transfusion)
// ----------------------------------------------------------
// Key = patient's blood group, value = donor groups the patient
// can safely receive. Example: an A+ patient can receive
// A+, A-, O+ or O- blood.
// (Always confirmed by the hospital's cross-match test.)
// ==========================================================

const CAN_RECEIVE_FROM = {
    "A+":  ["A+", "A-", "O+", "O-"],
    "A-":  ["A-", "O-"],
    "B+":  ["B+", "B-", "O+", "O-"],
    "B-":  ["B-", "O-"],
    "AB+": ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    "AB-": ["A-", "B-", "AB-", "O-"],
    "O+":  ["O+", "O-"],
    "O-":  ["O-"]
};

/**
 * Which donor blood groups should be shown?
 *   bloodGroup = "" (any)              -> null (no filter)
 *   compatible = false                 -> exact group only, e.g. ["A+"]
 *   compatible = true                  -> all groups the patient can receive
 */
function donorGroupsFor(bloodGroup, compatible) {
    if (!bloodGroup) return null;
    if (!compatible) return [bloodGroup];
    return CAN_RECEIVE_FROM[bloodGroup] || [bloodGroup];
}

module.exports = { CAN_RECEIVE_FROM, donorGroupsFor };
