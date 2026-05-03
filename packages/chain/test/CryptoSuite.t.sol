// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "../src/MferGearNFT.sol";
import {IBurnableToken, IERC20Payment, MferGearStore} from "../src/MferGearStore.sol";
import {MferCoin} from "../src/MferCoin.sol";
import {MferGptToken} from "../src/MferGptToken.sol";
import {MferGold} from "../src/MferGold.sol";
import {QuestRewardDistributor} from "../src/QuestRewardDistributor.sol";

contract CryptoSuiteTest {
    uint16 internal constant BEATER_DECK = 1;
    uint16 internal constant ROAD_LID = 2;
    uint16 internal constant LUCKY_LIGHTER = 3;
    uint16 internal constant ODD_PRICE_TEST_GEAR = 99;
    uint256 internal constant GEAR_ETH_PRICE = 0.01 ether;
    uint256 internal constant GEAR_TOKEN_PRICE = 100 ether;
    uint256 internal constant ROAD_LID_ETH_PRICE = 0.012 ether;
    uint256 internal constant ROAD_LID_TOKEN_PRICE = 125 ether;
    uint256 internal constant LUCKY_LIGHTER_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LUCKY_LIGHTER_TOKEN_PRICE = 69 ether;
    uint256 internal constant QUEST_REWARD = 250 ether;

    MferGold internal gold;
    MferCoin internal mfer;
    MferGptToken internal mfergpt;
    MferGearNFT internal gear;
    MferGearStore internal store;
    QuestRewardDistributor internal rewards;

    receive() external payable {}

    function setUp() public {
        gold = new MferGold("mferland gold", "GOLD", address(this));
        mfer = new MferCoin(address(this), 1_000 ether);
        mfergpt = new MferGptToken(address(this), 1_000 ether);
        gear = new MferGearNFT("mferland gear", "MGEAR", address(this));
        store = new MferGearStore(
            gear,
            gold,
            IERC20Payment(address(mfer)),
            IBurnableToken(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        rewards = new QuestRewardDistributor(gold, address(this));

        gold.setMinter(address(rewards), true);
        gear.setMinter(address(store));
        store.listGear(BEATER_DECK, GEAR_ETH_PRICE, GEAR_TOKEN_PRICE);
        store.listGear(ROAD_LID, ROAD_LID_ETH_PRICE, ROAD_LID_TOKEN_PRICE);
        store.listGear(LUCKY_LIGHTER, LUCKY_LIGHTER_ETH_PRICE, LUCKY_LIGHTER_TOKEN_PRICE);
    }

    function testLaunchesLocalErc20Token() public {
        assertEq(gold.name(), "mferland gold");
        assertEq(gold.symbol(), "GOLD");
        require(gold.decimals() == 18, "decimals mismatch");
        assertEq(gold.totalSupply(), 0);

        gold.mint(address(this), 10 ether);
        assertEq(gold.balanceOf(address(this)), 10 ether);
        assertEq(gold.totalSupply(), 10 ether);
    }

    function testLocalMferMatchesBaseTokenShape() public {
        assertEq(mfer.name(), "mfercoin");
        assertEq(mfer.symbol(), "$mfer");
        require(mfer.decimals() == 18, "decimals mismatch");
        assertEq(mfer.totalSupply(), 1_000 ether);

        mfer.burn(1 ether);
        assertEq(mfer.balanceOf(address(this)), 999 ether);
        assertEq(mfer.totalSupply(), 999 ether);

        (bool burnFromSupported,) = address(mfer).call(
            abi.encodeWithSignature("burnFrom(address,uint256)", address(this), 0)
        );
        assertFalse(burnFromSupported);
    }

    function testLocalMferGptMatchesBaseTokenShape() public {
        assertEq(mfergpt.name(), "mferGPT");
        assertEq(mfergpt.symbol(), "MFERGPT");
        require(mfergpt.decimals() == 18, "decimals mismatch");
        assertEq(mfergpt.totalSupply(), 1_000 ether);
        assertEq(mfergpt.nonces(address(this)), 0);
        require(mfergpt.DOMAIN_SEPARATOR() != bytes32(0), "domain separator missing");

        mfergpt.approve(address(this), 1 ether);
        mfergpt.burnFrom(address(this), 1 ether);
        assertEq(mfergpt.balanceOf(address(this)), 999 ether);
        assertEq(mfergpt.totalSupply(), 999 ether);
    }

    function testDistributesQuestRewardsOnce() public {
        bytes32 questId = keccak256("route-patrol-daily");
        rewards.distributeQuestReward(address(this), questId, QUEST_REWARD);
        assertEq(gold.balanceOf(address(this)), QUEST_REWARD);
        assertTrue(rewards.claimed(address(this), questId));

        try rewards.distributeQuestReward(address(this), questId, QUEST_REWARD) {
            fail("duplicate quest reward should revert");
        } catch {}
    }

    function testStoreClerkMintsNftItemsForEth() public {
        uint256 treasuryBefore = address(0xBEEF).balance;
        uint256 tokenId = store.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK);

        assertEq(tokenId, 1);
        assertEq(gear.ownerOf(tokenId), address(this));
        assertEq(gear.balanceOf(address(this)), 1);
        assertEq(address(0xBEEF).balance, treasuryBefore + GEAR_ETH_PRICE);
        (uint16 gearType, uint8 tier) = gear.gear(tokenId);
        assertEq(uint256(gearType), uint256(BEATER_DECK));
        assertEq(uint256(tier), 1);
    }

    function testStoreClerkMintsSmallGearCollection() public {
        uint256 deckTokenId = store.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK);
        uint256 lidTokenId = store.buyWithEth{value: ROAD_LID_ETH_PRICE}(ROAD_LID);

        uint256 lighterPrice = store.discountedTokenPrice(LUCKY_LIGHTER, store.MFER_DISCOUNT_BPS());
        assertEq(lighterPrice, LUCKY_LIGHTER_TOKEN_PRICE * 9 / 10);
        mfer.approve(address(store), lighterPrice);
        uint256 lighterTokenId = store.buyWithMfer(LUCKY_LIGHTER);

        assertEq(deckTokenId, 1);
        assertEq(lidTokenId, 2);
        assertEq(lighterTokenId, 3);
        assertEq(gear.balanceOf(address(this)), 3);

        (uint16 deckType, uint8 deckTier) = gear.gear(deckTokenId);
        (uint16 lidType, uint8 lidTier) = gear.gear(lidTokenId);
        (uint16 lighterType, uint8 lighterTier) = gear.gear(lighterTokenId);
        assertEq(uint256(deckType), uint256(BEATER_DECK));
        assertEq(uint256(lidType), uint256(ROAD_LID));
        assertEq(uint256(lighterType), uint256(LUCKY_LIGHTER));
        assertEq(uint256(deckTier), 1);
        assertEq(uint256(lidTier), 1);
        assertEq(uint256(lighterTier), 1);
    }

    function testRejectsWrongEthPrice() public {
        try store.buyWithEth{value: GEAR_ETH_PRICE - 1}(BEATER_DECK) {
            fail("wrong ETH price should revert");
        } catch {}
    }

    function testCalculatesDiscountsExactlyAcrossGearPrices() public {
        assertEq(store.discountedTokenPrice(BEATER_DECK, store.MFER_DISCOUNT_BPS()), 90 ether);
        assertEq(store.discountedTokenPrice(BEATER_DECK, store.MFERGPT_DISCOUNT_BPS()), 75 ether);
        assertEq(store.discountedTokenPrice(ROAD_LID, store.MFER_DISCOUNT_BPS()), 112.5 ether);
        assertEq(store.discountedTokenPrice(ROAD_LID, store.MFERGPT_DISCOUNT_BPS()), 93.75 ether);
        assertEq(store.discountedTokenPrice(LUCKY_LIGHTER, store.MFER_DISCOUNT_BPS()), 62.1 ether);
        assertEq(store.discountedTokenPrice(LUCKY_LIGHTER, store.MFERGPT_DISCOUNT_BPS()), 51.75 ether);

        store.listGear(ODD_PRICE_TEST_GEAR, 1 wei, 101);
        assertEq(store.discountedTokenPrice(ODD_PRICE_TEST_GEAR, store.MFER_DISCOUNT_BPS()), 90);
        assertEq(store.discountedTokenPrice(ODD_PRICE_TEST_GEAR, store.MFERGPT_DISCOUNT_BPS()), 75);
    }

    function testDiscountsMferPaymentsByTenPercent() public {
        uint256 price = store.discountedTokenPrice(BEATER_DECK, store.MFER_DISCOUNT_BPS());
        assertEq(price, 90 ether);

        mfer.approve(address(store), price);
        uint256 tokenId = store.buyWithMfer(BEATER_DECK);

        assertEq(gear.ownerOf(tokenId), address(this));
        assertEq(mfer.balanceOf(address(0xBEEF)), 90 ether);
        assertEq(mfer.balanceOf(address(this)), 910 ether);
    }

    function testMferPurchaseRequiresTheDiscountedAllowance() public {
        uint256 price = store.discountedTokenPrice(BEATER_DECK, store.MFER_DISCOUNT_BPS());
        mfer.approve(address(store), price - 1);

        try store.buyWithMfer(BEATER_DECK) {
            fail("discounted price should require full discounted allowance");
        } catch {}
    }

    function testDiscountsAndBurnsMferGptPaymentsByTwentyFivePercent() public {
        uint256 price = store.discountedTokenPrice(BEATER_DECK, store.MFERGPT_DISCOUNT_BPS());
        assertEq(price, 75 ether);
        uint256 supplyBefore = mfergpt.totalSupply();

        mfergpt.approve(address(store), price);
        uint256 tokenId = store.buyWithMferGpt(BEATER_DECK);

        assertEq(gear.ownerOf(tokenId), address(this));
        assertEq(mfergpt.balanceOf(address(0xBEEF)), 0);
        assertEq(mfergpt.balanceOf(address(this)), 925 ether);
        assertEq(mfergpt.totalSupply(), supplyBefore - 75 ether);
    }

    function testMferGptPurchaseRequiresTheDiscountedAllowance() public {
        uint256 price = store.discountedTokenPrice(BEATER_DECK, store.MFERGPT_DISCOUNT_BPS());
        mfergpt.approve(address(store), price - 1);

        try store.buyWithMferGpt(BEATER_DECK) {
            fail("burned token payment should require full discounted allowance");
        } catch {}
    }

    function testBurnsGoldToUpgradeGearThroughThreeTiers() public {
        uint256 tokenId = store.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK);
        rewards.distributeQuestReward(address(this), keccak256("daily-quest"), 250 ether);
        gold.approve(address(store), 175 ether);

        store.upgradeWithGold(tokenId);
        (, uint8 tierTwo) = gear.gear(tokenId);
        assertEq(uint256(tierTwo), 2);
        assertEq(gold.balanceOf(address(this)), 200 ether);

        store.upgradeWithGold(tokenId);
        (, uint8 tierThree) = gear.gear(tokenId);
        assertEq(uint256(tierThree), 3);
        assertEq(gold.balanceOf(address(this)), 75 ether);

        try store.upgradeWithGold(tokenId) {
            fail("tier 3 gear should not upgrade further");
        } catch {}
    }

    function testOnlyTokenOwnerCanUpgradeGear() public {
        uint256 tokenId = store.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK);
        rewards.distributeQuestReward(address(this), keccak256("owner-quest"), 250 ether);
        gold.approve(address(store), 50 ether);

        GearUpgradeAttack attacker = new GearUpgradeAttack(store);
        try attacker.upgrade(tokenId) {
            fail("non-owner should not upgrade gear");
        } catch {}

        (, uint8 tier) = gear.gear(tokenId);
        assertEq(uint256(tier), 1);
        assertEq(gold.balanceOf(address(this)), 250 ether);
    }

    function testCanUpgradeAnyMintedGearTypeOnchain() public {
        uint256 tokenId = store.buyWithEth{value: ROAD_LID_ETH_PRICE}(ROAD_LID);
        rewards.distributeQuestReward(address(this), keccak256("road-lid-upgrade"), 250 ether);
        gold.approve(address(store), 50 ether);

        store.upgradeWithGold(tokenId);

        (uint16 gearType, uint8 tier) = gear.gear(tokenId);
        assertEq(uint256(gearType), uint256(ROAD_LID));
        assertEq(uint256(tier), 2);
        assertEq(gold.balanceOf(address(this)), 200 ether);
    }

    function testOnlyRewarderCanDistributeQuestRewards() public {
        QuestRewardAttack attacker = new QuestRewardAttack(rewards);
        try attacker.claim(address(this), keccak256("fake-quest"), 10 ether) {
            fail("non-rewarder distribution should revert");
        } catch {}
    }

    function testCannotMintGearUntilStoreIsAuthorized() public {
        MferGearNFT lockedGear = new MferGearNFT("locked gear", "LOCK", address(this));
        MferGearStore lockedStore = new MferGearStore(
            lockedGear,
            gold,
            IERC20Payment(address(mfer)),
            IBurnableToken(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        lockedStore.listGear(BEATER_DECK, GEAR_ETH_PRICE, GEAR_TOKEN_PRICE);

        try lockedStore.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK) {
            fail("unauthorized store should not mint gear");
        } catch {}
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(string memory actual, string memory expected) internal pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "string mismatch");
    }

    function assertTrue(bool value) internal pure {
        require(value, "expected true");
    }

    function assertFalse(bool value) internal pure {
        require(!value, "expected false");
    }

    function fail(string memory message) internal pure {
        revert(message);
    }
}

contract QuestRewardAttack {
    QuestRewardDistributor internal rewards;

    constructor(QuestRewardDistributor rewardDistributor) {
        rewards = rewardDistributor;
    }

    function claim(address player, bytes32 questId, uint256 amount) external {
        rewards.distributeQuestReward(player, questId, amount);
    }
}

contract GearUpgradeAttack {
    MferGearStore internal store;

    constructor(MferGearStore gearStore) {
        store = gearStore;
    }

    function upgrade(uint256 tokenId) external {
        store.upgradeWithGold(tokenId);
    }
}
