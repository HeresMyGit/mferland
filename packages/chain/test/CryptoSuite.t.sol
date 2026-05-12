// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "../src/MferGearNFT.sol";
import {IERC20Payment, IGearProductPricing, MferGearStore} from "../src/MferGearStore.sol";
import {MferCoin} from "../src/MferCoin.sol";
import {MferGptToken} from "../src/MferGptToken.sol";
import {IMferPayment, IMferProductPricing, MferLaunchPass} from "../src/MferLaunchPass.sol";
import {MferPricing} from "../src/MferPricing.sol";

contract CryptoSuiteTest {
    uint16 internal constant BEATER_DECK = 1;
    uint16 internal constant ROAD_LID = 2;
    uint16 internal constant LUCKY_LIGHTER = 3;
    uint16 internal constant ODD_PRICE_TEST_GEAR = 99;
    uint256 internal constant GEAR_ETH_PRICE = 0.01 ether;
    uint256 internal constant GEAR_MFER_PRICE = 90 ether;
    uint256 internal constant GEAR_MFERGPT_PRICE = 75 ether;
    uint256 internal constant ROAD_LID_ETH_PRICE = 0.012 ether;
    uint256 internal constant ROAD_LID_MFER_PRICE = 112.5 ether;
    uint256 internal constant ROAD_LID_MFERGPT_PRICE = 93.75 ether;
    uint256 internal constant LUCKY_LIGHTER_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LUCKY_LIGHTER_MFER_PRICE = 62.1 ether;
    uint256 internal constant LUCKY_LIGHTER_MFERGPT_PRICE = 51.75 ether;
    uint256 internal constant LAUNCH_PASS_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LAUNCH_PASS_MFER_PRICE = 621 ether;
    uint256 internal constant LAUNCH_PASS_MFERGPT_PRICE = 517.5 ether;
    address internal constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    MferPricing internal pricing;
    MferCoin internal mfer;
    MferGptToken internal mfergpt;
    MferGearNFT internal gear;
    MferGearStore internal store;
    MferLaunchPass internal launchPass;

    receive() external payable {}

    function setUp() public {
        pricing = new MferPricing(address(this));
        pricing.setSeason0PassPrice(LAUNCH_PASS_ETH_PRICE, LAUNCH_PASS_MFER_PRICE, LAUNCH_PASS_MFERGPT_PRICE);
        pricing.setGearPrice(BEATER_DECK, GEAR_ETH_PRICE, GEAR_MFER_PRICE, GEAR_MFERGPT_PRICE);
        pricing.setGearPrice(ROAD_LID, ROAD_LID_ETH_PRICE, ROAD_LID_MFER_PRICE, ROAD_LID_MFERGPT_PRICE);
        pricing.setGearPrice(
            LUCKY_LIGHTER, LUCKY_LIGHTER_ETH_PRICE, LUCKY_LIGHTER_MFER_PRICE, LUCKY_LIGHTER_MFERGPT_PRICE
        );

        mfer = new MferCoin(address(this), 1_000 ether);
        mfergpt = new MferGptToken(address(this), 1_000 ether);
        gear = new MferGearNFT("mferland gear", "MGEAR", address(this));
        store = new MferGearStore(
            gear,
            IGearProductPricing(address(pricing)),
            IERC20Payment(address(mfer)),
            IERC20Payment(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        launchPass = new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferPayment(address(mfer)),
            IMferPayment(address(mfergpt)),
            IMferProductPricing(address(pricing)),
            payable(address(0xBEEF)),
            address(this),
            500
        );

        gear.setMinter(address(store));
        store.listGear(BEATER_DECK);
        store.listGear(ROAD_LID);
        store.listGear(LUCKY_LIGHTER);
    }

    function testPricingCatalogStoresPassAndGearPrices() public view {
        assertEq(pricing.SEASON_0_PASS_PRODUCT_ID(), launchPass.productId());
        assertEq(address(launchPass.pricing()), address(pricing));
        assertEq(launchPass.ethPrice(), LAUNCH_PASS_ETH_PRICE);
        assertEq(launchPass.mferPrice(), LAUNCH_PASS_MFER_PRICE);
        assertEq(launchPass.mferGptPrice(), LAUNCH_PASS_MFERGPT_PRICE);

        assertEq(store.ethPriceByGearType(BEATER_DECK), GEAR_ETH_PRICE);
        assertEq(store.mferPriceByGearType(BEATER_DECK), GEAR_MFER_PRICE);
        assertEq(store.mferGptPriceByGearType(BEATER_DECK), GEAR_MFERGPT_PRICE);
        assertEq(store.discountedTokenPrice(BEATER_DECK, store.MFER_DISCOUNT_BPS()), GEAR_MFER_PRICE);
        assertEq(store.discountedTokenPrice(BEATER_DECK, store.MFERGPT_DISCOUNT_BPS()), GEAR_MFERGPT_PRICE);
    }

    function testLaunchesLocalTokens() public {
        assertEq(mfer.name(), "mfercoin");
        assertEq(mfer.symbol(), "$mfer");
        require(mfer.decimals() == 18, "mfer decimals mismatch");
        assertEq(mfer.totalSupply(), 1_000 ether);
        mfer.burn(1 ether);
        assertEq(mfer.totalSupply(), 999 ether);

        assertEq(mfergpt.name(), "mferGPT");
        assertEq(mfergpt.symbol(), "MFERGPT");
        require(mfergpt.decimals() == 18, "mfergpt decimals mismatch");
        assertEq(mfergpt.totalSupply(), 1_000 ether);
        assertEq(mfergpt.nonces(address(this)), 0);
        require(mfergpt.DOMAIN_SEPARATOR() != bytes32(0), "domain separator missing");
    }

    function testStoreMintsNftGearForEth() public {
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

    function testStoreMintsSmallGearCollection() public {
        uint256 deckTokenId = store.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK);
        uint256 lidTokenId = store.buyWithEth{value: ROAD_LID_ETH_PRICE}(ROAD_LID);

        mfer.approve(address(store), LUCKY_LIGHTER_MFER_PRICE);
        uint256 lighterTokenId = store.buyWithMfer(LUCKY_LIGHTER, LUCKY_LIGHTER_MFER_PRICE);

        assertEq(deckTokenId, 1);
        assertEq(lidTokenId, 2);
        assertEq(lighterTokenId, 3);
        assertEq(gear.balanceOf(address(this)), 3);
    }

    function testRejectsWrongEthPrice() public {
        try store.buyWithEth{value: GEAR_ETH_PRICE - 1}(BEATER_DECK) {
            fail("wrong ETH price should revert");
        } catch {}
    }

    function testUsesSeparateMferAndMferGptGearPrices() public {
        assertEq(store.discountedTokenPrice(ROAD_LID, store.MFER_DISCOUNT_BPS()), ROAD_LID_MFER_PRICE);
        assertEq(store.discountedTokenPrice(ROAD_LID, store.MFERGPT_DISCOUNT_BPS()), ROAD_LID_MFERGPT_PRICE);

        uint256 treasuryBefore = mfer.balanceOf(address(0xBEEF));
        mfer.approve(address(store), ROAD_LID_MFER_PRICE);
        uint256 mferTokenId = store.buyWithMfer(ROAD_LID, ROAD_LID_MFER_PRICE);
        assertEq(gear.ownerOf(mferTokenId), address(this));
        assertEq(mfer.balanceOf(address(0xBEEF)), treasuryBefore + ROAD_LID_MFER_PRICE);

        uint256 supplyBefore = mfergpt.totalSupply();
        uint256 burnBefore = mfergpt.balanceOf(BURN_ADDRESS);
        mfergpt.approve(address(store), ROAD_LID_MFERGPT_PRICE);
        uint256 gptTokenId = store.buyWithMferGpt(ROAD_LID, ROAD_LID_MFERGPT_PRICE);
        assertEq(gear.ownerOf(gptTokenId), address(this));
        assertEq(mfergpt.balanceOf(address(0xBEEF)), 0);
        assertEq(mfergpt.balanceOf(BURN_ADDRESS), burnBefore + ROAD_LID_MFERGPT_PRICE);
        assertEq(mfergpt.totalSupply(), supplyBefore);
    }

    function testTokenPurchasesCannotSpendAboveQuotedMaximumAfterCentralPriceUpdate() public {
        mfer.approve(address(store), 1_000 ether);
        mfergpt.approve(address(store), 1_000 ether);

        pricing.setGearPrice(BEATER_DECK, GEAR_ETH_PRICE, GEAR_MFER_PRICE + 1 ether, GEAR_MFERGPT_PRICE + 1 ether);

        try store.buyWithMfer(BEATER_DECK, GEAR_MFER_PRICE) {
            fail("gear store should reject mfer price increases above the user quote");
        } catch {}

        try store.buyWithMferGpt(BEATER_DECK, GEAR_MFERGPT_PRICE) {
            fail("gear store should reject mferGPT price increases above the user quote");
        } catch {}

        assertEq(gear.nextTokenId(), 1);
        assertEq(mfer.balanceOf(address(this)), 1_000 ether);
        assertEq(mfergpt.balanceOf(address(this)), 1_000 ether);
    }

    function testLaunchPassMintsWithEthAndPaysTreasury() public {
        uint256 treasuryBefore = address(0xBEEF).balance;
        uint256 tokenId = launchPass.mintWithEth{value: LAUNCH_PASS_ETH_PRICE}();

        assertEq(tokenId, 1);
        assertEq(launchPass.ownerOf(tokenId), address(this));
        assertEq(launchPass.balanceOf(address(this)), 1);
        assertEq(address(0xBEEF).balance, treasuryBefore + LAUNCH_PASS_ETH_PRICE);
    }

    function testLaunchPassAcceptsMferPaymentToTreasury() public {
        uint256 treasuryBefore = mfer.balanceOf(address(0xBEEF));
        mfer.approve(address(launchPass), LAUNCH_PASS_MFER_PRICE);

        uint256 tokenId = launchPass.mintWithMfer(LAUNCH_PASS_MFER_PRICE);

        assertEq(tokenId, 1);
        assertEq(launchPass.ownerOf(tokenId), address(this));
        assertEq(mfer.balanceOf(address(0xBEEF)), treasuryBefore + LAUNCH_PASS_MFER_PRICE);
        assertEq(mfer.totalSupply(), 1_000 ether);
    }

    function testLaunchPassSendsMferGptPaymentToBurnAddress() public {
        uint256 supplyBefore = mfergpt.totalSupply();
        uint256 burnBefore = mfergpt.balanceOf(BURN_ADDRESS);
        mfergpt.approve(address(launchPass), LAUNCH_PASS_MFERGPT_PRICE);

        uint256 tokenId = launchPass.mintWithMferGpt(LAUNCH_PASS_MFERGPT_PRICE);

        assertEq(tokenId, 1);
        assertEq(launchPass.ownerOf(tokenId), address(this));
        assertEq(mfergpt.balanceOf(BURN_ADDRESS), burnBefore + LAUNCH_PASS_MFERGPT_PRICE);
        assertEq(mfergpt.totalSupply(), supplyBefore);
    }

    function testLaunchPassTokenMintsCannotSpendAboveQuotedMaximumAfterCentralPriceUpdate() public {
        mfer.approve(address(launchPass), 1_000 ether);
        mfergpt.approve(address(launchPass), 1_000 ether);

        pricing.setSeason0PassPrice(
            LAUNCH_PASS_ETH_PRICE,
            LAUNCH_PASS_MFER_PRICE + 1 ether,
            LAUNCH_PASS_MFERGPT_PRICE + 1 ether
        );

        try launchPass.mintWithMfer(LAUNCH_PASS_MFER_PRICE) {
            fail("launch pass should reject mfer price increases above the user quote");
        } catch {}

        try launchPass.mintWithMferGpt(LAUNCH_PASS_MFERGPT_PRICE) {
            fail("launch pass should reject mferGPT price increases above the user quote");
        } catch {}

        assertEq(launchPass.nextTokenId(), 1);
    }

    function testListingRequiresCentralPrice() public {
        try store.listGear(ODD_PRICE_TEST_GEAR) {
            fail("unpriced gear should not list");
        } catch {}

        pricing.setGearPrice(ODD_PRICE_TEST_GEAR, 1 wei, 90, 75);
        store.listGear(ODD_PRICE_TEST_GEAR);
        assertEq(store.ethPriceByGearType(ODD_PRICE_TEST_GEAR), 1 wei);
    }

    function testStoreRejectsFalseReturningMferPayment() public {
        FalseReturnToken falseMfer = new FalseReturnToken();
        MferGearNFT falseGear = new MferGearNFT("false gear", "FGEAR", address(this));
        MferGearStore falseStore = new MferGearStore(
            falseGear,
            IGearProductPricing(address(pricing)),
            IERC20Payment(address(falseMfer)),
            IERC20Payment(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        falseGear.setMinter(address(falseStore));
        falseStore.listGear(BEATER_DECK);

        try falseStore.buyWithMfer(BEATER_DECK, GEAR_MFER_PRICE) {
            fail("false-returning token payment should revert");
        } catch {}

        assertEq(falseGear.nextTokenId(), 1);
    }

    function testMferPaymentsMustActuallyReachTreasury() public {
        NoOpTransferToken noOpMfer = new NoOpTransferToken();
        MferGearNFT noOpGear = new MferGearNFT("noop gear", "NGEAR", address(this));
        MferGearStore noOpStore = new MferGearStore(
            noOpGear,
            IGearProductPricing(address(pricing)),
            IERC20Payment(address(noOpMfer)),
            IERC20Payment(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        noOpGear.setMinter(address(noOpStore));
        noOpStore.listGear(BEATER_DECK);

        try noOpStore.buyWithMfer(BEATER_DECK, GEAR_MFER_PRICE) {
            fail("no-op gear mfer payment should revert");
        } catch {}
        assertEq(noOpGear.nextTokenId(), 1);
    }

    function testMferGptPaymentsMustActuallyReachBurnAddress() public {
        NoOpTransferToken noOpMferGpt = new NoOpTransferToken();
        MferGearNFT burnGear = new MferGearNFT("burn gear", "BGEAR", address(this));
        MferGearStore burnStore = new MferGearStore(
            burnGear,
            IGearProductPricing(address(pricing)),
            IERC20Payment(address(mfer)),
            IERC20Payment(address(noOpMferGpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        burnGear.setMinter(address(burnStore));
        burnStore.listGear(BEATER_DECK);

        try burnStore.buyWithMferGpt(BEATER_DECK, GEAR_MFERGPT_PRICE) {
            fail("no-op gear mferGPT burn-address payment should revert");
        } catch {}
        assertEq(burnGear.nextTokenId(), 1);
    }

    function testOwnersCanRotateAdminAndTreasuryControl() public {
        OwnershipActor nextOwner = new OwnershipActor();
        pricing.transferOwnership(address(nextOwner));
        assertEq(pricing.owner(), address(nextOwner));
        try pricing.setSeason0PassPrice(LAUNCH_PASS_ETH_PRICE + 1, LAUNCH_PASS_MFER_PRICE, LAUNCH_PASS_MFERGPT_PRICE) {
            fail("previous pricing owner should not set pricing");
        } catch {}
        nextOwner.setSeason0PassPrice(pricing, LAUNCH_PASS_ETH_PRICE + 1, LAUNCH_PASS_MFER_PRICE, LAUNCH_PASS_MFERGPT_PRICE);
        assertEq(launchPass.ethPrice(), LAUNCH_PASS_ETH_PRICE + 1);

        store.transferOwnership(address(nextOwner));
        assertEq(store.owner(), address(nextOwner));
        try store.setTreasury(payable(address(0xCAFE))) {
            fail("previous store owner should not set treasury");
        } catch {}
        nextOwner.setGearStoreTreasury(store, payable(address(0xCAFE)));
        assertEq(store.treasury(), address(0xCAFE));
    }

    function testCannotMintGearUntilStoreIsAuthorized() public {
        MferGearNFT lockedGear = new MferGearNFT("locked gear", "LOCK", address(this));
        MferGearStore lockedStore = new MferGearStore(
            lockedGear,
            IGearProductPricing(address(pricing)),
            IERC20Payment(address(mfer)),
            IERC20Payment(address(mfergpt)),
            payable(address(0xBEEF)),
            address(this)
        );
        lockedStore.listGear(BEATER_DECK);

        try lockedStore.buyWithEth{value: GEAR_ETH_PRICE}(BEATER_DECK) {
            fail("unauthorized store should not mint gear");
        } catch {}
    }

    function testMferGptPermitRejectsMalleableOrInvalidVSignatures() public {
        bytes32 highS = bytes32(uint256(0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) + 1);

        try mfergpt.permit(address(this), address(0xBEEF), 1 ether, block.timestamp + 1, 27, bytes32(0), highS) {
            fail("high-s permit should revert");
        } catch {}

        try mfergpt.permit(
            address(this), address(0xBEEF), 1 ether, block.timestamp + 1, 29, bytes32(0), bytes32(uint256(1))
        ) {
            fail("invalid v permit should revert");
        } catch {}

        assertEq(mfergpt.nonces(address(this)), 0);
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "bytes32 mismatch");
    }

    function assertEq(string memory actual, string memory expected) internal pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "string mismatch");
    }

    function fail(string memory message) internal pure {
        revert(message);
    }
}

contract FalseReturnToken is IERC20Payment {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

contract NoOpTransferToken is IERC20Payment {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return true;
    }
}

contract OwnershipActor {
    function setSeason0PassPrice(MferPricing pricing, uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)
        external
    {
        pricing.setSeason0PassPrice(ethPrice, mferPrice, mferGptPrice);
    }

    function setGearStoreTreasury(MferGearStore store, address payable treasury) external {
        store.setTreasury(treasury);
    }
}
